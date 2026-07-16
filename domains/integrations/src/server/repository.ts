import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@resfolio/database";
import { getProfile } from "@resfolio/profile/server";

import {
  candidateItemSchema,
  type CandidateItem,
  type CandidateKind,
  type CandidateRoute,
  type RouteConfidence,
  type RouteTarget,
} from "../candidate";
import { detectUserEdit } from "../apply";
import { assertRouteTarget } from "../routing";
import { getConnector } from "../registry";
import type { AuthMode } from "../contract";
import {
  decryptSecret,
  encryptSecret,
  keyringFromHex,
  type TokenKeyring,
} from "./crypto";
import { env } from "./env";
import {
  ConnectionNotFoundError,
  IntegrationDataError,
  StagedItemNotFoundError,
  TokenKeyMissingError,
  UnknownConnectorError,
} from "./errors";

/**
 * Connection + staging persistence (docs/architecture/12-integrations-and-sync.md).
 * The only code that touches `integration_connections` / `integration_items` /
 * `integration_sync_runs`. Every owner-facing function takes `userId` and
 * scopes through the profile that user owns (same discipline as the site and
 * profile repositories — ownership enforced here, never assumed).
 *
 * Tokens are decrypted **only** inside `getDecryptedToken`, called by the
 * import runtime; no exported record type ever carries token material.
 */

export const CONNECTION_STATUSES = [
  "active",
  "needs_reauth",
  "degraded",
  "disabled",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** The import lifecycle (doc 12): `new` awaits triage; `imported` marks the
 * row a **receipt**; `refresh_available` is the re-import suggestion;
 * `dismissed` sticks until the upstream content actually changes. */
export const ITEM_STATES = [
  "new",
  "imported",
  "refresh_available",
  "dismissed",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

/** States `importItem` accepts: a pending candidate or a re-import. */
export const IMPORTABLE_STATES: readonly ItemState[] = [
  "new",
  "refresh_available",
];

export interface ConnectionRecord {
  id: string;
  connectorId: string;
  connectorName: string;
  authMode: AuthMode;
  /** May offer "Check for updates" (connector capability). */
  refreshable: boolean;
  /** The connector-validated input (feed URL, username) — safe to show. */
  input: unknown;
  status: ConnectionStatus;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

/** A staged candidate awaiting triage. */
export interface PendingItemRecord {
  id: string;
  connectionId: string;
  connectorId: string;
  externalId: string;
  kind: CandidateKind;
  candidate: CandidateItem;
  fingerprint: string;
  /** The routing stage's output — `sectionKey: null` = unrouted ("needs a
   * home"), waits for the user. */
  route: CandidateRoute;
  updatedAt: Date;
}

/** An import receipt — provenance + dedupe key, nothing more (doc 12). The
 * imported profile item is the user's ordinary content; this row exists so
 * re-imports dedupe and "check for updates" can badge. */
export interface ImportReceiptRecord {
  id: string;
  connectionId: string;
  connectorId: string;
  kind: CandidateKind;
  title: string;
  url: string | null;
  /** `refresh_available` = newer version upstream (badge + re-import button);
   * `imported`/`dismissed` = settled. */
  state: Extract<ItemState, "imported" | "refresh_available" | "dismissed">;
  /** True when a re-import would replace content the user edited (or
   * removed) — the UI must warn before that click. */
  userEdited: boolean;
  appliedItemId: string | null;
  appliedSectionKey: string | null;
  /** Approximate — the row's last transition (import or refresh flag). */
  lastChangedAt: Date;
}

export interface ImportRunRecord {
  id: string;
  status: string;
  error: string | null;
  counts: Record<string, number> | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/** The keyring from validated env, or null when no key is configured. */
export function tokenKeyring(): TokenKeyring | null {
  return env.INTEGRATIONS_TOKEN_KEY
    ? keyringFromHex(env.INTEGRATIONS_TOKEN_KEY)
    : null;
}

async function requireProfile(userId: string): Promise<{ id: string }> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true },
  });
  if (!row) {
    throw new IntegrationDataError("No profile exists for this user.");
  }
  return row;
}

function toConnectionRecord(
  row: typeof schema.integrationConnection.$inferSelect,
): ConnectionRecord {
  const connector = getConnector(row.connectorId);
  return {
    id: row.id,
    connectorId: row.connectorId,
    connectorName: connector?.name ?? row.connectorId,
    authMode: connector?.authMode ?? "public",
    refreshable: connector?.capabilities.refreshable ?? false,
    input: row.input,
    status: row.status as ConnectionStatus,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

/** Hostnames a user-supplied `public` input may not point at — a coarse SSRF
 * guard for server-side fetches (doc 10). DNS-rebinding-grade hardening comes
 * with the job runner; this blocks the obvious local/metadata targets.
 * Production-only: local development and e2e legitimately connect feeds
 * served from localhost. */
const BLOCKED_HOST_PATTERN =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[::1\]|.*\.local|.*\.internal)/i;

function assertSafePublicInput(input: unknown): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (!input || typeof input !== "object") {
    return;
  }
  for (const value of Object.values(input)) {
    if (typeof value !== "string") {
      continue;
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue; // Not a URL-shaped input (username etc.).
    }
    if (BLOCKED_HOST_PATTERN.test(url.hostname)) {
      throw new IntegrationDataError(
        "That address points at a private network and can't be fetched.",
      );
    }
  }
}

/** JSON.stringify with object keys sorted recursively — key order never
 * decides whether two connection inputs are "the same". */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

export interface NewConnectionInput {
  connectorId: string;
  /** Required (and validated by the connector's schema) for public/file. */
  input?: unknown;
  /** Required for oauth2/token; encrypted before storage. */
  token?: string;
}

/**
 * Store a connection. Public/file inputs are validated by the connector's own
 * Zod schema; oauth2/token connections require both a token and a configured
 * encryption key. Duplicate public connections (same connector + identical
 * input) are rejected — re-connecting the same feed should re-run the import,
 * not create a second row.
 */
export async function createConnection(
  userId: string,
  { connectorId, input, token }: NewConnectionInput,
): Promise<ConnectionRecord> {
  const profile = await requireProfile(userId);
  const connector = getConnector(connectorId);
  if (!connector) {
    throw new UnknownConnectorError(connectorId);
  }

  let validatedInput: unknown = null;
  let encryptedToken: string | null = null;

  if (connector.authMode === "public" || connector.authMode === "file") {
    const parsed = connector.input?.safeParse(input);
    if (!parsed?.success) {
      throw new IntegrationDataError("That input isn't valid for this source.");
    }
    validatedInput = parsed.data;
    assertSafePublicInput(validatedInput);
  } else {
    if (!token) {
      throw new IntegrationDataError("This source requires a token.");
    }
    const keyring = tokenKeyring();
    if (!keyring) {
      throw new TokenKeyMissingError();
    }
    encryptedToken = encryptSecret(token, keyring);
  }

  // One row per (connector, input): reconnecting an identical public/file
  // input is a no-op returning the existing connection. Postgres JSONB does
  // not preserve key order, so compare with a key-sorted stringify.
  const existing = await db.query.integrationConnection.findMany({
    where: and(
      eq(schema.integrationConnection.profileId, profile.id),
      eq(schema.integrationConnection.connectorId, connectorId),
    ),
  });
  const duplicate = existing.find(
    (row) => stableStringify(row.input) === stableStringify(validatedInput),
  );
  if (duplicate && connector.authMode !== "oauth2") {
    return toConnectionRecord(duplicate);
  }

  const inserted = await db
    .insert(schema.integrationConnection)
    .values({
      profileId: profile.id,
      connectorId,
      input: validatedInput,
      encryptedToken,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new IntegrationDataError("Failed to create connection.");
  }
  return toConnectionRecord(row);
}

export async function listConnections(
  userId: string,
): Promise<ConnectionRecord[]> {
  const profile = await requireProfile(userId);
  const rows = await db.query.integrationConnection.findMany({
    where: eq(schema.integrationConnection.profileId, profile.id),
    orderBy: desc(schema.integrationConnection.createdAt),
  });
  return rows.map(toConnectionRecord);
}

/** The raw connection row, ownership verified — internal to the runtime. */
export async function requireOwnedConnection(
  userId: string,
  connectionId: string,
): Promise<typeof schema.integrationConnection.$inferSelect> {
  const profile = await requireProfile(userId);
  const row = await db.query.integrationConnection.findFirst({
    where: and(
      eq(schema.integrationConnection.id, connectionId),
      eq(schema.integrationConnection.profileId, profile.id),
    ),
  });
  if (!row) {
    throw new ConnectionNotFoundError();
  }
  return row;
}

/** Deleting a connection cascades its staged rows and run log. Imported
 * profile items stay — they're the user's content, and a source has no
 * ongoing ownership over them (doc 12: disconnecting never deletes from the
 * Profile). */
export async function deleteConnection(
  userId: string,
  connectionId: string,
): Promise<void> {
  const row = await requireOwnedConnection(userId, connectionId);
  await db
    .delete(schema.integrationConnection)
    .where(eq(schema.integrationConnection.id, row.id));
}

/** Decrypt this connection's provider token — import-runtime only. */
export function getDecryptedToken(
  row: typeof schema.integrationConnection.$inferSelect,
): string | null {
  if (!row.encryptedToken) {
    return null;
  }
  const keyring = tokenKeyring();
  if (!keyring) {
    throw new TokenKeyMissingError();
  }
  return decryptSecret(row.encryptedToken, keyring);
}

function rowRoute(
  row: typeof schema.integrationItem.$inferSelect,
): CandidateRoute {
  return {
    sectionKey: (row.routeSectionKey as RouteTarget | null) ?? null,
    confidence: (row.routeConfidence as RouteConfidence) ?? "certain",
  };
}

function toPendingRecord(
  row: typeof schema.integrationItem.$inferSelect,
  connectorId: string,
): PendingItemRecord {
  return {
    id: row.id,
    connectionId: row.connectionId,
    connectorId,
    externalId: row.externalId,
    kind: row.kind as CandidateKind,
    candidate: candidateItemSchema.parse(row.candidate),
    fingerprint: row.fingerprint,
    route: rowRoute(row),
    updatedAt: row.updatedAt,
  };
}

/** Every candidate awaiting triage across the user's connections — the
 * workspace's pending list. Newest first. */
export async function listPendingItems(
  userId: string,
): Promise<PendingItemRecord[]> {
  const profile = await requireProfile(userId);
  const rows = await db
    .select({
      item: schema.integrationItem,
      connectorId: schema.integrationConnection.connectorId,
    })
    .from(schema.integrationItem)
    .innerJoin(
      schema.integrationConnection,
      eq(
        schema.integrationItem.connectionId,
        schema.integrationConnection.id,
      ),
    )
    .where(
      and(
        eq(schema.integrationConnection.profileId, profile.id),
        eq(schema.integrationItem.state, "new"),
      ),
    )
    .orderBy(desc(schema.integrationItem.updatedAt));
  return rows.map(({ item, connectorId }) => toPendingRecord(item, connectorId));
}

/**
 * Every import receipt (rows that have been imported at least once —
 * `baseFingerprint` set), newest first: the workspace's history. For
 * `refresh_available` rows the current draft is checked so the UI can warn
 * when a re-import would replace a user edit.
 */
export async function listImportReceipts(
  userId: string,
): Promise<ImportReceiptRecord[]> {
  const profile = await requireProfile(userId);
  const rows = await db
    .select({
      item: schema.integrationItem,
      connectorId: schema.integrationConnection.connectorId,
    })
    .from(schema.integrationItem)
    .innerJoin(
      schema.integrationConnection,
      eq(
        schema.integrationItem.connectionId,
        schema.integrationConnection.id,
      ),
    )
    .where(
      and(
        eq(schema.integrationConnection.profileId, profile.id),
        isNotNull(schema.integrationItem.baseFingerprint),
      ),
    )
    .orderBy(desc(schema.integrationItem.updatedAt));

  const needsEditCheck = rows.some(
    ({ item }) => item.state === "refresh_available",
  );
  const draft = needsEditCheck ? await getProfile(userId) : null;

  return rows.map(({ item, connectorId }) => {
    const candidate = candidateItemSchema.parse(item.candidate);
    const kind = item.kind as CandidateKind;
    return {
      id: item.id,
      connectionId: item.connectionId,
      connectorId,
      kind,
      title: candidate.title,
      url: candidate.url ?? null,
      state: item.state as ImportReceiptRecord["state"],
      userEdited:
        item.state === "refresh_available" && draft
          ? detectUserEdit(
              draft.data,
              kind,
              item.appliedItemId,
              item.appliedFingerprint,
            )
          : false,
      appliedItemId: item.appliedItemId,
      appliedSectionKey: item.appliedSectionKey,
      lastChangedAt: item.updatedAt,
    };
  });
}

/** The staged item + its connection row, ownership verified. */
export async function requireOwnedItem(
  userId: string,
  itemId: string,
): Promise<{
  item: typeof schema.integrationItem.$inferSelect;
  connection: typeof schema.integrationConnection.$inferSelect;
}> {
  const profile = await requireProfile(userId);
  const rows = await db
    .select({
      item: schema.integrationItem,
      connection: schema.integrationConnection,
    })
    .from(schema.integrationItem)
    .innerJoin(
      schema.integrationConnection,
      eq(
        schema.integrationItem.connectionId,
        schema.integrationConnection.id,
      ),
    )
    .where(
      and(
        eq(schema.integrationItem.id, itemId),
        eq(schema.integrationConnection.profileId, profile.id),
      ),
    );
  const row = rows[0];
  if (!row) {
    throw new StagedItemNotFoundError();
  }
  return row;
}

/** Dismiss a pending candidate or a refresh suggestion. It stays dismissed on
 * later runs until its upstream content actually changes (then it
 * resurfaces). */
export async function dismissItem(
  userId: string,
  itemId: string,
): Promise<void> {
  const { item } = await requireOwnedItem(userId, itemId);
  if (!IMPORTABLE_STATES.includes(item.state as ItemState)) {
    throw new IntegrationDataError("This item has nothing to dismiss.");
  }
  await db
    .update(schema.integrationItem)
    .set({ state: "dismissed" })
    .where(eq(schema.integrationItem.id, item.id));
}

/**
 * Re-route a pending candidate — the user giving an unrouted ("needs a home")
 * item a destination, or overriding a suggestion, without importing yet.
 */
export async function routeItem(
  userId: string,
  itemId: string,
  sectionKey: RouteTarget,
): Promise<void> {
  const { item } = await requireOwnedItem(userId, itemId);
  if (item.state !== "new") {
    throw new IntegrationDataError("Only pending items can be re-routed.");
  }
  assertRouteTarget(item.kind as CandidateKind, sectionKey);
  await db
    .update(schema.integrationItem)
    .set({ routeSectionKey: sectionKey, routeConfidence: "certain" })
    .where(eq(schema.integrationItem.id, item.id));
}

/** The most recent import runs for a connection — the history surface. */
export async function listImportRuns(
  userId: string,
  connectionId: string,
  limit = 10,
): Promise<ImportRunRecord[]> {
  const row = await requireOwnedConnection(userId, connectionId);
  const runs = await db.query.integrationSyncRun.findMany({
    where: eq(schema.integrationSyncRun.connectionId, row.id),
    orderBy: desc(schema.integrationSyncRun.startedAt),
    limit,
  });
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    error: run.error,
    counts: (run.counts as Record<string, number> | null) ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }));
}

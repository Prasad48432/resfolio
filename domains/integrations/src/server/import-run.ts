import { eq, and, lt, isNull } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import { computeFingerprint } from "../fingerprint";
import { classifyCandidate, type ImportClassification } from "../classify";
import { resolveRoute } from "../routing";
import { getConnector } from "../registry";
import type { CandidateItem } from "../candidate";
import type { FetchContext } from "../contract";
import { getDecryptedToken, requireOwnedConnection } from "./repository";
import { UnknownConnectorError } from "./errors";

/**
 * The import runtime (docs/architecture/12-integrations-and-sync.md): drives
 * a connector's `fetch` → `normalize`, routes, and stages the result.
 * Idempotent by construction — candidates upsert on
 * `(connectionId, externalId)`, and content already imported with the same
 * fingerprint classifies `duplicate` and is silently skipped, so re-running
 * an import (or re-connecting the same feed) can never create a second copy.
 *
 * This runs on user action only: connecting runs the first import inline;
 * "Import again" / "Check for updates" re-run it. Nothing here ever touches
 * the Profile — a changed receipt at most becomes a `refresh_available`
 * badge, and upstream deletion of imported content produces nothing (the
 * user's item is theirs now). Scheduled refresh, if it ever lands, enqueues
 * this same function to keep badges fresh — one code path.
 */

export interface ImportCounts extends Record<string, number> {
  fetched: number;
  new: number;
  duplicate: number;
  refreshAvailable: number;
}

export interface ImportRunSummary {
  runId: string;
  status: "succeeded" | "failed";
  counts: ImportCounts;
  error: string | null;
}

/** Per-run request ceiling — a stand-in for the Redis per-provider/per-
 * connection budgets (doc 12) until they land. */
const MAX_REQUESTS_PER_RUN = 50;

class RunBudgetExceededError extends Error {
  constructor() {
    super(`Import exceeded ${MAX_REQUESTS_PER_RUN} requests in one run.`);
    this.name = "RunBudgetExceededError";
  }
}

/**
 * The pre-authenticated, budgeted fetch handed to connectors (the
 * `FetchContext` seam). Tokens are injected as an Authorization header here
 * and never reach connector code; the wrapper also notices auth-shaped
 * failures so the runtime can flip the connection to `needs_reauth`.
 */
function buildRuntimeFetch(
  token: string | null,
  onAuthFailure: () => void,
): typeof fetch {
  let remaining = MAX_REQUESTS_PER_RUN;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (remaining <= 0) {
      throw new RunBudgetExceededError();
    }
    remaining -= 1;
    const headers = new Headers(init?.headers);
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    const response = await fetch(input, { ...init, headers });
    if (token && (response.status === 401 || response.status === 403)) {
      onAuthFailure();
    }
    return response;
  }) as typeof fetch;
}

/**
 * Resolve the row's next state from the pure classification, without
 * churning settled rows: a dismissal sticks until the upstream content
 * actually changes, and a `duplicate` settles back to `imported` (which also
 * clears a stale refresh badge if upstream reverted).
 */
function resolveState(
  existing: { state: string; fingerprint: string } | undefined,
  classified: ImportClassification,
  newFingerprint: string,
): string {
  if (
    existing &&
    existing.state === "dismissed" &&
    existing.fingerprint === newFingerprint
  ) {
    return "dismissed";
  }
  if (classified === "duplicate") {
    return "imported";
  }
  return classified; // "new" | "refresh_available"
}

/**
 * Run one import for a connection the user owns. Always writes an
 * `integration_sync_runs` row; a failure is recorded there (and flips the
 * connection to `needs_reauth`/`degraded`) rather than thrown, so the UI gets
 * a summary either way.
 */
export async function runImport(
  userId: string,
  connectionId: string,
): Promise<ImportRunSummary> {
  const connection = await requireOwnedConnection(userId, connectionId);
  const connector = getConnector(connection.connectorId);
  if (!connector) {
    throw new UnknownConnectorError(connection.connectorId);
  }

  const startedAt = new Date();
  const inserted = await db
    .insert(schema.integrationSyncRun)
    .values({ connectionId: connection.id, status: "running" })
    .returning({ id: schema.integrationSyncRun.id });
  const runId = inserted[0]?.id as string;

  const counts: ImportCounts = {
    fetched: 0,
    new: 0,
    duplicate: 0,
    refreshAvailable: 0,
  };

  let authFailed = false;
  let nextCursor: string | undefined;
  const startCursor = connection.cursor ?? undefined;

  try {
    const ctx: FetchContext<unknown> = {
      fetch: buildRuntimeFetch(getDecryptedToken(connection), () => {
        authFailed = true;
      }),
      input: connection.input ?? undefined,
      cursor: startCursor,
      setCursor: (cursor) => {
        nextCursor = cursor;
      },
    };

    for await (const raw of connector.fetch(ctx)) {
      counts.fetched += 1;
      for (const candidate of connector.normalize(raw)) {
        await stageCandidate(connection.id, candidate, counts);
      }
    }

    // Staging hygiene, only after a *full* walk (an incremental cursor-bounded
    // fetch legitimately skips old items): a pending row whose upstream
    // content disappeared has nothing left to review — delete it. Receipts
    // (`baseFingerprint` set) are untouched: upstream deletion produces
    // nothing for imported content.
    if (!connector.capabilities.incremental || startCursor === undefined) {
      await pruneUnseenPending(connection.id, startedAt);
    }

    await db
      .update(schema.integrationConnection)
      .set({
        cursor: nextCursor ?? connection.cursor,
        lastSyncedAt: new Date(),
        status: "active",
      })
      .where(eq(schema.integrationConnection.id, connection.id));

    await db
      .update(schema.integrationSyncRun)
      .set({ status: "succeeded", counts, finishedAt: new Date() })
      .where(eq(schema.integrationSyncRun.id, runId));

    return { runId, status: "succeeded", counts, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    // 401/403 with a stored token means the grant is gone — stop and ask for
    // re-auth rather than retrying into a lockout (doc 12). Anything else is
    // the provider misbehaving: mark degraded, keep the connection.
    await db
      .update(schema.integrationConnection)
      .set({ status: authFailed ? "needs_reauth" : "degraded" })
      .where(eq(schema.integrationConnection.id, connection.id));
    await db
      .update(schema.integrationSyncRun)
      .set({ status: "failed", error: message, counts, finishedAt: new Date() })
      .where(eq(schema.integrationSyncRun.id, runId));
    return { runId, status: "failed", counts, error: message };
  }
}

/** Upsert one candidate into staging with its import classification and its
 * resolved route (the pipeline's Route stage). */
async function stageCandidate(
  connectionId: string,
  candidate: CandidateItem,
  counts: ImportCounts,
): Promise<void> {
  const fingerprint = computeFingerprint(candidate);
  const existing = await db.query.integrationItem.findFirst({
    where: and(
      eq(schema.integrationItem.connectionId, connectionId),
      eq(schema.integrationItem.externalId, candidate.externalId),
    ),
  });

  const classified = classifyCandidate({
    externalFingerprint: fingerprint,
    baseFingerprint: existing?.baseFingerprint ?? null,
  });
  if (classified === "new") {
    counts.new += 1;
  } else if (classified === "duplicate") {
    counts.duplicate += 1;
  } else {
    counts.refreshAvailable += 1;
  }

  const state = resolveState(existing, classified, fingerprint);
  const route = resolveRoute(candidate);
  const now = new Date();

  if (existing) {
    // Duplicate-skip: identical content on a settled row only refreshes the
    // seen marker — no state churn, no candidate rewrite.
    if (
      classified === "duplicate" &&
      existing.fingerprint === fingerprint &&
      existing.state === state
    ) {
      await db
        .update(schema.integrationItem)
        .set({ lastSeenAt: now })
        .where(eq(schema.integrationItem.id, existing.id));
      return;
    }
    // The user's explicit re-route on a pending row survives a re-fetch.
    const keepUserRoute =
      existing.state === "new" && existing.routeSectionKey !== null;
    await db
      .update(schema.integrationItem)
      .set({
        candidate,
        fingerprint,
        kind: candidate.kind,
        state,
        routeSectionKey: keepUserRoute
          ? existing.routeSectionKey
          : route.sectionKey,
        routeConfidence: keepUserRoute
          ? existing.routeConfidence
          : route.confidence,
        lastSeenAt: now,
      })
      .where(eq(schema.integrationItem.id, existing.id));
    return;
  }
  await db.insert(schema.integrationItem).values({
    connectionId,
    externalId: candidate.externalId,
    kind: candidate.kind,
    candidate,
    fingerprint,
    state,
    routeSectionKey: route.sectionKey,
    routeConfidence: route.confidence,
    lastSeenAt: now,
  });
}

/** Delete never-imported rows this full walk didn't see — their upstream
 * content is gone, so there is nothing left to triage. */
async function pruneUnseenPending(
  connectionId: string,
  runStartedAt: Date,
): Promise<void> {
  await db
    .delete(schema.integrationItem)
    .where(
      and(
        eq(schema.integrationItem.connectionId, connectionId),
        lt(schema.integrationItem.lastSeenAt, runStartedAt),
        isNull(schema.integrationItem.baseFingerprint),
      ),
    );
}

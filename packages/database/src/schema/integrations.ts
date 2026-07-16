import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { profile } from "./profiles";

/**
 * Imports storage (docs/architecture/12-integrations-and-sync.md,
 * 07-storage.md) — the Connect → Fetch → Normalize → **Route** → **Stage** →
 * Review → Import pipeline's Postgres side. Nothing here ever reaches the
 * Profile except through `@resfolio/integrations/server`'s `importItem`,
 * which is an ordinary `@resfolio/profile` draft mutation behind a user
 * click.
 *
 * Hand-authored conventions as everywhere: `timestamptz` for instants, JSONB
 * for schema-in-code documents (candidates are re-validated by the domain's
 * `candidateItemSchema` on both write and read), relational columns for
 * anything we look up, join, or enforce.
 */

/**
 * A connection: one grant/input against one provider (doc 12). Scoped through
 * the profile (like `sites`) — ownership is enforced in the domain layer.
 * Multiple connections per connector are allowed (two RSS feeds); the domain
 * dedupes where it matters.
 *
 * `encrypted_token` is the AES-256-GCM envelope (key-versioned, encrypted by
 * `@resfolio/integrations/server` — never plaintext, never logged, never sent
 * to the client) for `oauth2`/`token` connectors; null for `public`/`file`.
 * `input` is the connector-validated input (feed URL, username) for
 * `public`/`file`; null for `oauth2`/`token`.
 */
export const integrationConnection = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    input: jsonb("input"),
    encryptedToken: text("encrypted_token"),
    // active | needs_reauth | degraded | disabled (doc 12 failure states).
    status: text("status").notNull().default("active"),
    // Opaque incremental cursor persisted between runs (page, ETag, watermark).
    cursor: text("cursor"),
    // Dormant (doc 12 revision: auto-accept was rejected as a product
    // surface). The column stays — cheap — but the domain never reads it.
    autoAccept: boolean("auto_accept").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("integration_connections_profile_id_idx").on(table.profileId),
  ],
);

/**
 * Staged candidates + import receipts — the workspace's rows. Idempotency by
 * construction: upsert on `(connection_id, external_id)` (doc 12), so
 * re-fetches refresh rows instead of duplicating them.
 *
 * `state` is the import lifecycle: `new` (pending triage), `imported` (the
 * row is now a **receipt** — provenance + dedupe key, nothing more),
 * `refresh_available` (upstream changed after import; a badge + re-import
 * button, never auto-applied), `dismissed` (sticky until upstream content
 * changes). `route_section_key`/`route_confidence` are the resolved routing
 * stage output (`null` section = unrouted, the "needs a home" bucket).
 * `base_fingerprint` is the content fingerprint at last import;
 * `applied_fingerprint` hashes the content as applied to the draft (after
 * inline edits), so a re-import can warn when it would replace a user edit.
 */
export const integrationItem = pgTable(
  "integration_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnection.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    kind: text("kind").notNull(),
    // The full CandidateItem (incl. `raw`), re-validated by the domain schema.
    candidate: jsonb("candidate").notNull(),
    // computeFingerprint(candidate) — content only, never `raw`.
    fingerprint: text("fingerprint").notNull(),
    state: text("state").notNull(),
    // The resolved route (doc 12 routing stage): a profile section key or
    // "basics"; null = unrouted ("needs a home" — waits for the user).
    routeSectionKey: text("route_section_key"),
    routeConfidence: text("route_confidence").notNull().default("certain"),
    // Fingerprint recorded at last import (the receipt's dedupe key); null
    // until first imported.
    baseFingerprint: text("base_fingerprint"),
    // Fingerprint of the payload actually applied (after inline edits) — the
    // re-import warning compares the current draft item against this.
    appliedFingerprint: text("applied_fingerprint"),
    // The profile item id stamped at import + where it landed; null until
    // imported (and for profileBasics, which patches basics, not a section).
    appliedItemId: text("applied_item_id"),
    appliedSectionKey: text("applied_section_key"),
    // Refreshed every run that still sees this externalId — lets a full
    // re-fetch clean up pending rows whose upstream content disappeared.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("integration_items_connection_external_unique").on(
      table.connectionId,
      table.externalId,
    ),
    index("integration_items_connection_id_idx").on(table.connectionId),
  ],
);

/**
 * One row per import run (doc 12) — the import history and the support
 * surface. `counts` is a small JSONB summary
 * (`fetched/new/duplicate/refreshAvailable`). The SQL name keeps "sync"
 * (renaming buys nothing); everywhere user-facing this is an import run.
 */
export const integrationSyncRun = pgTable(
  "integration_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnection.id, { onDelete: "cascade" }),
    // running | succeeded | failed
    status: text("status").notNull().default("running"),
    error: text("error"),
    counts: jsonb("counts"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("integration_sync_runs_connection_id_idx").on(table.connectionId),
  ],
);

export const integrationConnectionRelations = relations(
  integrationConnection,
  ({ one, many }) => ({
    profile: one(profile, {
      fields: [integrationConnection.profileId],
      references: [profile.id],
    }),
    items: many(integrationItem),
    syncRuns: many(integrationSyncRun),
  }),
);

export const integrationItemRelations = relations(
  integrationItem,
  ({ one }) => ({
    connection: one(integrationConnection, {
      fields: [integrationItem.connectionId],
      references: [integrationConnection.id],
    }),
  }),
);

export const integrationSyncRunRelations = relations(
  integrationSyncRun,
  ({ one }) => ({
    connection: one(integrationConnection, {
      fields: [integrationSyncRun.connectionId],
      references: [integrationConnection.id],
    }),
  }),
);

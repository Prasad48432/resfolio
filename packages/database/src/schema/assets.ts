import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profile } from "./profiles";

/**
 * Assets — the ledger of every object we hold in R2
 * (docs/architecture/07-storage.md).
 *
 * **This table is why orphan cleanup is possible at all.** A key is referenced
 * from inside a JSONB blob (`basics.avatarUrl`, a site's `config.bannerImage`)
 * — places no query can scan and no foreign key can reach. Without a row per
 * object, "which uploads is nothing pointing at?" is unanswerable, and storage
 * grows forever. The bucket holds bytes; this holds the facts about them.
 *
 * `owner_id` is the **profile**, not the user: a profile is what gets deleted,
 * and the `onDelete: "cascade"` here is what makes the database half of that
 * deletion automatic. The R2 half is a prefix delete under `u/<ownerId>/`,
 * which is why the key layout is owner-first — the two halves line up.
 *
 * `content_hash` is the sha256 of the **processed** bytes and is what makes
 * the key. Uploading the same image twice therefore lands on the same row
 * (the unique index below), so dedupe is a property of the schema rather than
 * a check someone has to remember to write.
 *
 * `referenced_at` is the liveness signal for the orphan sweep: set when a key
 * is written into profile or site content, left null for an upload that was
 * never committed to anything. A row that has been null for longer than the
 * grace period is garbage — and note the grace period matters, because there
 * is a real window between "uploaded" and "the autosave that references it"
 * during which a live asset legitimately looks orphaned.
 */
export const asset = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    /** An `AssetKind` from @resfolio/storage. Text, not a PG enum: adding a
     * kind should be a code change, not a migration. */
    kind: text("kind").notNull(),
    /** The R2 object key. Globally unique — it contains the content hash. */
    key: text("key").notNull().unique(),
    contentHash: text("content_hash").notNull(),
    contentType: text("content_type").notNull(),
    /** Size of the stored (processed) object. `bigint` because a file size
     * has no business being capped at 2GB by a column type. */
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    /** When this key was last written into user-visible content. Null means
     * "uploaded but never committed" — the orphan sweep's input. */
    referencedAt: timestamp("referenced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assets_owner_id_idx").on(table.ownerId),
    // The dedupe guarantee: one row per (owner, kind, content). Two users
    // uploading the same image get their own copies — cross-tenant dedupe
    // would make one user's deletion break another user's page.
    uniqueIndex("assets_owner_kind_hash_idx").on(
      table.ownerId,
      table.kind,
      table.contentHash,
    ),
    // Drives the orphan sweep: unreferenced rows, oldest first.
    index("assets_referenced_at_idx").on(table.referencedAt),
  ],
);

export const assetRelations = relations(asset, ({ one }) => ({
  owner: one(profile, {
    fields: [asset.ownerId],
    references: [profile.id],
  }),
}));

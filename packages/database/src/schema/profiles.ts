import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Profile storage (docs/architecture/07-storage.md, 01-profile-engine.md).
 *
 * Hand-authored — unlike `auth.ts` (Better-Auth-generated). Convention for
 * every non-generated table: `timestamptz` (`withTimezone`) so instants are
 * unambiguous, and JSONB for the schema-in-code document (validated by
 * @resfolio/profile's Zod schema + its own `schemaVersion`), relational
 * columns for anything we look up, join, or enforce.
 *
 * `draft` holds the mutable working copy the editor autosaves. `draftRev`
 * is a monotonic counter for optimistic concurrency (doc 01: every autosave
 * sends the base revision it edited from; a stale write is rejected).
 * Publishing snapshots the draft into an immutable `profile_versions` row
 * and points `published_version_id` at it.
 */
export const profile = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  draft: jsonb("draft").notNull(),
  draftRev: integer("draft_rev").notNull().default(0),
  // Nullable + no inline FK: the target row is created in the same publish
  // transaction, and a self-referential inline FK complicates that ordering.
  publishedVersionId: uuid("published_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Immutable published snapshots (doc 07: append-only). `version` is a
 * per-profile monotonic integer; `(profile_id, version)` is unique.
 * Retention (keep last N on free tier) is a later prune job.
 */
export const profileVersion = pgTable(
  "profile_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("profile_versions_profile_version_unique").on(
      table.profileId,
      table.version,
    ),
    index("profile_versions_profile_id_idx").on(table.profileId),
  ],
);

export const profileRelations = relations(profile, ({ one, many }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
  versions: many(profileVersion),
  publishedVersion: one(profileVersion, {
    fields: [profile.publishedVersionId],
    references: [profileVersion.id],
  }),
}));

export const profileVersionRelations = relations(profileVersion, ({ one }) => ({
  profile: one(profile, {
    fields: [profileVersion.profileId],
    references: [profile.id],
  }),
}));

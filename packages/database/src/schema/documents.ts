import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profile } from "./profiles";

/**
 * Documents — a `Profile × config` rendering (docs/architecture/07-storage.md,
 * 01-profile-engine.md, 09-rendering-pipeline.md). A document names a template,
 * pins its major version, and carries the presentation `config` plus a `view`
 * (the ViewDefinition: section selection/order/deltas). Content is never
 * duplicated here — the Profile stays the single source of truth; a document
 * only records how to project and present it.
 *
 * Hand-authored (like `profiles`): `timestamptz` for unambiguous instants,
 * JSONB for the schema-in-code documents (`config` re-validated by the
 * template's own Zod schema at render; `view` by @resfolio/profile's
 * `viewDefinitionSchema`), relational columns for anything we look up, join,
 * or enforce. `kind` discriminates future document types (cover letters, …);
 * only `resume` exists today.
 */
export const document = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("resume"),
    name: text("name").notNull(),
    templateId: text("template_id").notNull(),
    templateMajor: integer("template_major").notNull(),
    config: jsonb("config").notNull(),
    // The ViewDefinition: which sections/items this document shows, and in what
    // order. `{}` is the identity view (everything, canonical order) — the
    // resume config layer writes `include`/`order`/`exclude` here.
    view: jsonb("view").notNull().default({}),
    // `public` | `private` (doc 02). Public is the default and renders the
    // owner's **published** profile version at a permanent URL; private renders
    // a "this resume is private" page. Text + a domain Zod enum rather than a
    // pg enum: adding a state stays a data change, matching `sites.discoverable`
    // and the schema-in-code convention (doc 07).
    visibility: text("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("documents_profile_id_idx").on(table.profileId)],
);

export const documentRelations = relations(document, ({ one }) => ({
  profile: one(profile, {
    fields: [document.profileId],
    references: [profile.id],
  }),
}));

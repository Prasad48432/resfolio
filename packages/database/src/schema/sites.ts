import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profile, profileVersion } from "./profiles";

/**
 * Sites — a public portfolio (docs/architecture/03-portfolio-rendering.md,
 * 04-deployment.md, 07-storage.md). A Site is `Profile × (template + config)`,
 * never a copy of content: it names a template, pins its major, and carries
 * the presentation `config` plus a `view` (the ViewDefinition). The Profile
 * stays the single source of truth.
 *
 * Hand-authored (like `profiles`/`documents`): `timestamptz` for unambiguous
 * instants, JSONB for the schema-in-code `config` (re-validated by the
 * template's own Zod schema at render) and `view` (by @resfolio/profile's
 * `viewDefinitionSchema`), relational columns for anything we look up, join,
 * or enforce.
 *
 * The public `<username>` is the owning profile's **handle** (`profiles.handle`),
 * not a column here — it is an identity shared by the portfolio and resume
 * outputs, so it lives on the Profile (migration 0012 promoted it off this
 * table). The render host resolves `/p/<handle>` by finding the profile, then
 * its site. One site per profile for now (unique `profile_id`); the schema
 * doesn't forbid many, but the domain layer claims exactly one.
 *
 * `published_version_id` pins which immutable `profile_versions` snapshot the
 * public pages render — a cached page can therefore never show draft state
 * (doc 04). Null until first publish (the site exists as a draft claim before
 * it goes live). No inline FK, matching `profiles.published_version_id`:
 * pointing at an append-only snapshot table, nullable, set post-hoc.
 */
export const site = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .unique()
      .references(() => profile.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    templateMajor: integer("template_major").notNull(),
    config: jsonb("config").notNull(),
    // Identity view ({}) until per-site section tailoring ships; the column
    // exists now so tailoring is a data change, not a migration.
    view: jsonb("view").notNull().default({}),
    // Which published snapshot the public pages render; null until first
    // publish. Nullable + no inline FK — same rationale as profiles.
    publishedVersionId: uuid("published_version_id"),
    // Whether the site's presentation (template + config + discoverable) has
    // changed since it was last published — the live cached page is stale until
    // the next `publishSite`. Set true on every `updateSite`, cleared on
    // publish; drives the dashboard's "Publish changes" state (doc 04). A
    // profile republish is tracked separately by the version pin above.
    hasUnpublishedChanges: boolean("has_unpublished_changes")
      .notNull()
      .default(true),
    // The site's "list me publicly / index me" toggle (doc 04). A
    // non-discoverable site still serves — it just asks crawlers not to index
    // and is omitted from the platform sitemap.
    discoverable: boolean("discoverable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("sites_profile_id_idx").on(table.profileId)],
);

export const siteRelations = relations(site, ({ one }) => ({
  profile: one(profile, {
    fields: [site.profileId],
    references: [profile.id],
  }),
  publishedVersion: one(profileVersion, {
    fields: [site.publishedVersionId],
    references: [profileVersion.id],
  }),
}));

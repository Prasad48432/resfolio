import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profile } from "./profiles";

/**
 * Blog posts — natively authored writing (docs/architecture/07-storage.md,
 * 01-profile-engine.md).
 *
 * **Why this is a table and not a section of the profile JSON.** The Profile
 * is one JSONB document that the editor rewrites in full on a debounced
 * autosave, and that `profile_versions` snapshots in full on every publish.
 * Post bodies are unbounded prose; carried inside that document they would
 * make every keystroke in the *profile* editor rewrite every post, and every
 * published version duplicate all of them. Posts are their own rows for the
 * same reason `documents` and `sites` are.
 *
 * This does not make the Profile any less the source of truth. A post is
 * profile-owned content (`profile_id`, cascade delete), and `buildProfileView`
 * projects published posts into the Writing section — so every renderer still
 * sees one unified Writing list, exactly as it does for imported references.
 * What lives here is the body; what the Profile owns is the identity.
 *
 * `body` is a **ProseMirror/TipTap document**, not the Markdown subset the
 * profile's rich-text fields use. That subset is deliberately small (bold,
 * italic, links, hyphen lists) because it has to survive plain-text ATS
 * extraction in a résumé. A post needs headings, code blocks, task lists,
 * images with captions and callouts — none of which it can express. The node
 * whitelist lives in `@resfolio/blog`, which re-validates on every write; raw
 * HTML is not representable in the node types at all.
 */
export const blogPost = pgTable(
  "blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    /** URL segment, unique per profile (the index below). Auto-derived from
     * the title on first save, then the user's to change — so it never shifts
     * under a published link because a typo was fixed in the title. */
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),

    /** The TipTap document, validated by `blogBodySchema` on every write. */
    body: jsonb("body").notNull(),

    /** R2 object key, not a URL: the delivery origin is expected to move
     * (r2.dev → custom domain), and storing the key means that swap stays
     * cosmetic. Resolved through `assetUrl` at read time. */
    coverAssetKey: text("cover_asset_key"),

    tags: jsonb("tags").notNull().default([]),

    /** `draft` | `published`. Text + a domain Zod enum rather than a pg enum,
     * matching `documents.visibility` and `sites.discoverable` — adding a
     * state stays a data change (doc 07). */
    status: text("status").notNull().default("draft"),

    /**
     * Derived from `body` on every write and stored rather than computed at
     * read time, so that listing 50 posts does not mean walking 50 documents.
     * It is never user-editable — the domain recomputes it and the column is
     * only ever written from that computation.
     */
    readingMinutes: integer("reading_minutes").notNull().default(1),

    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    /** Set on the first publish and preserved across later edits — the date a
     * post entered the world does not change because it was corrected. Null
     * while it has never been published. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("blog_posts_profile_id_idx").on(table.profileId),
    // Slugs are the public URL segment, so they must be unique *per profile* —
    // two users may both write "hello-world", one user may not.
    uniqueIndex("blog_posts_profile_slug_idx").on(table.profileId, table.slug),
    // Drives the published-posts listing and the Writing projection.
    index("blog_posts_published_at_idx").on(table.publishedAt),
  ],
);

export const blogPostRelations = relations(blogPost, ({ one }) => ({
  profile: one(profile, {
    fields: [blogPost.profileId],
    references: [profile.id],
  }),
}));

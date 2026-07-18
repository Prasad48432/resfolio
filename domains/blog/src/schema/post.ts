import { z } from "zod";

import { blogBodySchema, emptyBlogBody, type BlogBody } from "./content";
import { slugify } from "./derive";

/**
 * The post contract — everything about a post that is not its body.
 *
 * A post is profile-owned content. It has its own `status` rather than
 * inheriting the profile's draft/published state, because the two answer
 * different questions: the profile's publish decides whether *you* are visible,
 * a post's decides whether *this piece of writing* is. Publishing your profile
 * must not publish a half-written draft.
 */

export const BLOG_POST_STATUSES = ["draft", "published"] as const;
export const blogPostStatusSchema = z.enum(BLOG_POST_STATUSES);
export type BlogPostStatus = z.infer<typeof blogPostStatusSchema>;

/**
 * Slug rules. Lowercase alphanumeric with single hyphens — the shape
 * `slugify` produces, restated as a validator so a hand-edited slug obeys the
 * same grammar as a generated one.
 */
export const blogSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "A slug is required.")
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    "Use lowercase letters, numbers and hyphens.",
  );

export const blogTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(12)
  // Tags are a set presented as a list: dedupe on the way in so the UI never
  // has to, and case-fold so "React" and "react" are one tag. The *first*
  // spelling wins — the author's original capitalisation is the one they meant,
  // and a later stray lowercase repeat should not rewrite it.
  .transform((tags) => {
    const seen = new Map<string, string>();
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, tag);
      }
    }
    return [...seen.values()];
  })
  .default([]);

export interface BlogPostRecord {
  id: string;
  profileId: string;
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBody;
  /** R2 object key, resolved to a URL at read time. */
  coverAssetKey: string | null;
  tags: string[];
  status: BlogPostStatus;
  /** Derived from `body` on every write — never accepted from a client. */
  readingMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The editor's patch shape.
 *
 * `readingMinutes` is **absent by construction**, not merely ignored: it is
 * derived, and a field a client cannot send is a field that cannot drift.
 * `publishedAt` is absent for the same reason — it is a consequence of the
 * first publish, decided by the repository.
 */
export const updateBlogPostSchema = z.object({
  title: z.string().trim().max(200).optional(),
  slug: blogSlugSchema.optional(),
  excerpt: z.string().trim().max(400).optional(),
  body: blogBodySchema.optional(),
  coverAssetKey: z.string().trim().max(512).nullable().optional(),
  tags: blogTagsSchema.optional(),
  status: blogPostStatusSchema.optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(200).nullable().optional(),
});
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

export interface NewBlogPostInput {
  title: string;
  slug?: string;
  body?: BlogBody;
}

/** A brand-new post's initial state: an untitled draft with an empty body. */
export function newBlogPostInput(title = ""): NewBlogPostInput {
  const trimmed = title.trim();
  return {
    title: trimmed,
    slug: trimmed ? slugify(trimmed) : undefined,
    body: emptyBlogBody(),
  };
}

/**
 * Default ceiling on embedded images per post.
 *
 * Configurable rather than hardcoded, per the product requirement: the
 * repository takes a `maxImagesPerPost` option and the dashboard passes the
 * env-configured value, so raising the limit for a plan tier later is a value
 * change and not a code change. This constant is only the fallback.
 */
export const DEFAULT_MAX_IMAGES_PER_POST = 5;

/**
 * SEO title/description with fallbacks applied — what a renderer should
 * actually emit. Kept pure and here rather than in a template so every surface
 * (portfolio page, sitemap, OG tags) resolves them identically.
 */
export function resolveSeo(post: BlogPostRecord): {
  title: string;
  description: string;
} {
  return {
    title: post.seoTitle?.trim() || post.title,
    description: post.seoDescription?.trim() || post.excerpt,
  };
}

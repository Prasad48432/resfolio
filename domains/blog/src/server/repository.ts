import { and, desc, eq, ne } from "drizzle-orm";

import { db, schema } from "@resfolio/database";
import { releaseAssetKeys } from "@resfolio/storage/server";

import {
  BlogDataError,
  BlogImageLimitError,
  BlogPostNotFoundError,
  BlogSlugTakenError,
} from "../errors";
import {
  blogBodySchema,
  emptyBlogBody,
  type BlogBody,
} from "../schema/content";
import {
  collectBodyAssetKeys,
  countBodyImages,
  deriveExcerpt,
  readingMinutes,
  slugify,
  uniqueSlug,
} from "../schema/derive";
import {
  blogPostStatusSchema,
  blogTagsSchema,
  updateBlogPostSchema,
  DEFAULT_MAX_IMAGES_PER_POST,
  type BlogPostRecord,
  type BlogPostStatus,
  type NewBlogPostInput,
  type UpdateBlogPostInput,
} from "../schema/post";

/**
 * Blog persistence (docs/architecture/07-storage.md). The only code that
 * touches the `blog_posts` table.
 *
 * Every function takes `userId` and scopes its query to the profile that user
 * owns — ownership is enforced here, never assumed from the caller (docs 06,
 * 10). The one exception is `getPublishedPostBySlug`, which the public render
 * host calls without a session and which therefore refuses to return anything
 * that is not published.
 */

function toRecord(row: typeof schema.blogPost.$inferSelect): BlogPostRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    // Re-validated on the way *out* as well as in: a body that predates a
    // schema change should fail loudly here rather than reach a renderer that
    // assumes the current node set.
    body: blogBodySchema.parse(row.body),
    coverAssetKey: row.coverAssetKey,
    tags: blogTagsSchema.parse(row.tags),
    status: blogPostStatusSchema.parse(row.status),
    readingMinutes: row.readingMinutes,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The id of the profile a user owns, or throw. Posts are scoped through this
 * so a user can only ever see or mutate their own. */
async function requireProfileId(userId: string): Promise<string> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true },
  });
  if (!row) {
    throw new BlogDataError("No profile exists for this user.");
  }
  return row.id;
}

async function takenSlugs(
  profileId: string,
  exceptPostId?: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ slug: schema.blogPost.slug })
    .from(schema.blogPost)
    .where(
      exceptPostId
        ? and(
            eq(schema.blogPost.profileId, profileId),
            ne(schema.blogPost.id, exceptPostId),
          )
        : eq(schema.blogPost.profileId, profileId),
    );
  return new Set(rows.map((row) => row.slug));
}

export async function createPost(
  userId: string,
  input: NewBlogPostInput,
): Promise<BlogPostRecord> {
  const profileId = await requireProfileId(userId);
  const body = blogBodySchema.parse(input.body ?? emptyBlogBody());
  const title = input.title.trim();

  // Resolved against existing slugs rather than trusted: two posts created
  // from the same title must not race onto the same URL.
  const slug = uniqueSlug(
    input.slug ?? slugify(title) ?? "",
    await takenSlugs(profileId),
  );

  const inserted = await db
    .insert(schema.blogPost)
    .values({
      profileId,
      title,
      slug,
      excerpt: "",
      body,
      tags: [],
      status: "draft",
      readingMinutes: readingMinutes(body),
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new BlogDataError("Failed to create post.");
  }
  return toRecord(row);
}

/** A user's posts, most-recently-updated first. */
export async function listPosts(userId: string): Promise<BlogPostRecord[]> {
  const profileId = await requireProfileId(userId);
  const rows = await db.query.blogPost.findMany({
    where: eq(schema.blogPost.profileId, profileId),
    orderBy: desc(schema.blogPost.updatedAt),
  });
  return rows.map(toRecord);
}

export async function getPost(
  userId: string,
  id: string,
): Promise<BlogPostRecord> {
  const profileId = await requireProfileId(userId);
  const row = await db.query.blogPost.findFirst({
    where: and(
      eq(schema.blogPost.id, id),
      eq(schema.blogPost.profileId, profileId),
    ),
  });
  if (!row) {
    throw new BlogPostNotFoundError();
  }
  return toRecord(row);
}

/**
 * Update a post.
 *
 * Three things are decided here rather than accepted from the caller, because
 * each is a fact about the content that a client has no authority over:
 *
 * - **`readingMinutes`** is recomputed from the body whenever the body changes.
 *   This is what makes "never entered manually" a property of the system
 *   rather than a convention — there is no path that writes a supplied value.
 * - **`publishedAt`** is stamped on the first transition to `published` and
 *   never moved afterwards. Re-publishing an edited post does not restart its
 *   life; unpublishing and republishing does not either.
 * - **`excerpt`** falls back to the body's opening prose only while the author
 *   has not written one. Deriving it unconditionally would make an excerpt
 *   that differs from the first line impossible to keep.
 */
export async function updatePost(
  userId: string,
  id: string,
  patch: UpdateBlogPostInput,
  options: { maxImagesPerPost?: number } = {},
): Promise<BlogPostRecord> {
  const profileId = await requireProfileId(userId);
  const validated = updateBlogPostSchema.parse(patch);
  const existing = await getPost(userId, id);

  const limit = options.maxImagesPerPost ?? DEFAULT_MAX_IMAGES_PER_POST;

  const next: Record<string, unknown> = { ...validated };

  if (validated.body) {
    // The ceiling is enforced here as well as at upload time. Upload is the
    // friendly check; this is the one that cannot be bypassed by a body
    // assembled any other way (paste of a copied post, a future importer).
    if (countBodyImages(validated.body) > limit) {
      throw new BlogImageLimitError(limit);
    }
    next.readingMinutes = readingMinutes(validated.body);

    const excerptAfter = validated.excerpt ?? existing.excerpt;
    if (!excerptAfter.trim()) {
      next.excerpt = deriveExcerpt(validated.body);
    }
  }

  if (validated.slug && validated.slug !== existing.slug) {
    if ((await takenSlugs(profileId, id)).has(validated.slug)) {
      throw new BlogSlugTakenError(validated.slug);
    }
  }

  if (validated.status === "published" && !existing.publishedAt) {
    next.publishedAt = new Date();
  }

  const updated = await db
    .update(schema.blogPost)
    .set(next)
    .where(
      and(eq(schema.blogPost.id, id), eq(schema.blogPost.profileId, profileId)),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    throw new BlogPostNotFoundError();
  }

  // The post that just released a cover may have been the only thing using it.
  if (
    validated.coverAssetKey !== undefined &&
    existing.coverAssetKey &&
    existing.coverAssetKey !== validated.coverAssetKey
  ) {
    await releaseKeysNoLongerUsed(profileId, [existing.coverAssetKey]);
  }

  // Images removed from the body during this edit are released the same way.
  if (validated.body) {
    const before = collectBodyAssetKeys(existing.body);
    const after = collectBodyAssetKeys(validated.body);
    const dropped = [...before].filter((key) => !after.has(key));
    if (dropped.length > 0) {
      await releaseKeysNoLongerUsed(profileId, dropped);
    }
  }

  return toRecord(row);
}

/**
 * Every asset key the owner's posts currently reference — the "live" set for
 * cleanup decisions. Optionally excluding one post, which is how "used by any
 * post *other than* this one" is asked.
 */
async function referencedKeys(
  profileId: string,
  exceptPostId?: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      body: schema.blogPost.body,
      coverAssetKey: schema.blogPost.coverAssetKey,
    })
    .from(schema.blogPost)
    .where(
      exceptPostId
        ? and(
            eq(schema.blogPost.profileId, profileId),
            ne(schema.blogPost.id, exceptPostId),
          )
        : eq(schema.blogPost.profileId, profileId),
    );

  const keys = new Set<string>();
  for (const row of rows) {
    if (row.coverAssetKey) {
      keys.add(row.coverAssetKey);
    }
    // Parsed leniently: one unparseable body must not block cleanup for the
    // rest, but it must also never *contribute* a smaller protected set than
    // reality — so a parse failure conservatively protects nothing from that
    // row while the row itself is left untouched.
    const parsed = blogBodySchema.safeParse(row.body);
    if (parsed.success) {
      for (const key of collectBodyAssetKeys(parsed.data)) {
        keys.add(key);
      }
    }
  }
  return keys;
}

/** Release keys that no remaining post references. Best-effort: storage being
 * unconfigured or failing must never fail the user's save. */
async function releaseKeysNoLongerUsed(
  profileId: string,
  keys: readonly string[],
  exceptPostId?: string,
): Promise<void> {
  try {
    await releaseAssetKeys({
      keys,
      protectedKeys: await referencedKeys(profileId, exceptPostId),
    });
  } catch {
    // The orphan sweep is the backstop — an object we failed to delete now is
    // collected later, which is the recoverable direction.
  }
}

/**
 * Permanently delete a post **and the images belonging exclusively to it.**
 *
 * "Exclusively" is load-bearing and is why this cannot be a plain `DELETE`.
 * Because keys are content hashes deduped per `(owner, kind, hash)`, an image
 * used in two posts is one object; deleting this post's whole key set would
 * blank the other post's image with no way to recover it. So the row goes
 * first, and then the keys it held are released against what every *remaining*
 * post still references.
 *
 * Ordering matters: the row is deleted before the protected set is computed, so
 * the set is the truth *after* this post is gone. Computing it first would
 * count this post's own keys as live and delete nothing.
 */
export async function deletePost(userId: string, id: string): Promise<void> {
  const profileId = await requireProfileId(userId);
  const post = await getPost(userId, id);

  const owned = collectBodyAssetKeys(post.body);
  if (post.coverAssetKey) {
    owned.add(post.coverAssetKey);
  }

  const deleted = await db
    .delete(schema.blogPost)
    .where(
      and(eq(schema.blogPost.id, id), eq(schema.blogPost.profileId, profileId)),
    )
    .returning({ id: schema.blogPost.id });
  if (deleted.length === 0) {
    throw new BlogPostNotFoundError();
  }

  await releaseKeysNoLongerUsed(profileId, [...owned]);
}

/** How many distinct images a post currently embeds — the upload route's
 * pre-flight check, so a refused upload never spends bytes. */
export async function countPostImages(
  userId: string,
  id: string,
): Promise<number> {
  const post = await getPost(userId, id);
  return countBodyImages(post.body);
}

/**
 * Published posts for a profile, newest first — the projection source for the
 * Writing section and, later, the public blog routes.
 *
 * Takes a `profileId` rather than a `userId` because its callers are the view
 * builder and the render host, neither of which has a session. It returns only
 * published posts, so there is no posture in which it can leak a draft.
 */
export async function listPublishedPosts(
  profileId: string,
): Promise<BlogPostRecord[]> {
  const rows = await db.query.blogPost.findMany({
    where: and(
      eq(schema.blogPost.profileId, profileId),
      eq(schema.blogPost.status, "published" satisfies BlogPostStatus),
    ),
    orderBy: desc(schema.blogPost.publishedAt),
  });
  return rows.map(toRecord);
}

/** A single published post by slug, for the public route. Never returns a
 * draft — an unpublished post is indistinguishable from a missing one. */
export async function getPublishedPostBySlug(
  profileId: string,
  slug: string,
): Promise<BlogPostRecord> {
  const row = await db.query.blogPost.findFirst({
    where: and(
      eq(schema.blogPost.profileId, profileId),
      eq(schema.blogPost.slug, slug),
      eq(schema.blogPost.status, "published" satisfies BlogPostStatus),
    ),
  });
  if (!row) {
    throw new BlogPostNotFoundError();
  }
  return toRecord(row);
}

export type { BlogBody };

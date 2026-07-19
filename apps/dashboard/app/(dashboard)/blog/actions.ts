"use server";

import {
  blogBodySchema,
  blogPostStatusSchema,
  blogSlugSchema,
  blogTagsSchema,
  countBodyImages,
  newBlogPostInput,
} from "@resfolio/blog";
import {
  createPost,
  deletePost,
  getPost,
  updatePost,
} from "@resfolio/blog/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction } from "@/lib/actions";
import { markReferencedAssets } from "@/lib/assets";
import { maxImagesPerPost } from "@/lib/blog-config";
import { revalidatePublicSite } from "@/lib/revalidate-site";

/**
 * Blog post mutations (docs/architecture/06-api-architecture.md): thin adapters
 * over `@resfolio/blog/server`. No business logic lives here — reading time,
 * slug collision handling, publish stamping and image cleanup are all decided
 * in the domain, so a second caller (a future API route, an importer) gets the
 * same behaviour without re-implementing it.
 */

export const createPostAction = createAction({
  name: "blog.create",
  input: z.object({ title: z.string().trim().max(200).default("") }),
  handler: async ({ title }, ctx) => {
    // The owning profile must exist before a post can be attached to it — a
    // brand-new user writing before their first profile save is ordinary.
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    const post = await createPost(ctx.userId, newBlogPostInput(title));
    revalidatePath("/blog");
    return { id: post.id, slug: post.slug };
  },
});

export const updatePostAction = createAction({
  name: "blog.update",
  input: z.object({
    id: z.string().min(1),
    title: z.string().trim().max(200).optional(),
    slug: blogSlugSchema.optional(),
    excerpt: z.string().trim().max(400).optional(),
    body: blogBodySchema.optional(),
    coverAssetKey: z.string().trim().max(512).nullable().optional(),
    tags: blogTagsSchema.optional(),
    status: blogPostStatusSchema.optional(),
    seoTitle: z.string().trim().max(70).nullable().optional(),
    seoDescription: z.string().trim().max(200).nullable().optional(),
  }),
  handler: async ({ id, ...patch }, ctx) => {
    const post = await updatePost(ctx.userId, id, patch, {
      maxImagesPerPost: maxImagesPerPost(),
    });

    // Tell the orphan sweep these uploads are live. Best-effort by design — a
    // failed mark must never fail the user's save (doc 07).
    await markReferencedAssets({
      body: post.body,
      coverAssetKey: post.coverAssetKey,
    });

    if (patch.status !== undefined || patch.title !== undefined) {
      // The list shows title and status.
      revalidatePath("/blog");
    }

    // The public site renders published posts, so any edit to one can change
    // what a visitor sees — the Writing list on the home page, the post itself,
    // or both. Unconditional rather than gated on `status`: a retitled or
    // re-tagged published post is just as stale, and the check for "did this
    // change anything public?" is the cache's job, not this action's.
    //
    // The profile draft's Writing section is projected from these rows too, so
    // the editor's read-only rows refresh with it.
    await revalidatePublicSite({ profileId: post.profileId });
    revalidatePath("/profile");

    return {
      updatedAt: post.updatedAt.toISOString(),
      // Echoed back because both are *derived* server-side: the editor renders
      // the authoritative values rather than its own guess at them.
      readingMinutes: post.readingMinutes,
      excerpt: post.excerpt,
      slug: post.slug,
      publishedAt: post.publishedAt?.toISOString() ?? null,
    };
  },
});

export const deletePostAction = createAction({
  name: "blog.delete",
  input: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, ctx) => {
    // Deletes the row *and* releases the images no other post is using — the
    // whole reason this goes through the domain rather than a bare delete.
    const { profileId } = await deletePost(ctx.userId, id);
    revalidatePath("/blog");
    // A deleted post must disappear from the live site and from the Writing
    // section immediately — this is the case where staleness is most visible,
    // because the reason people delete a post is that it should not be up.
    await revalidatePublicSite({ profileId });
    revalidatePath("/profile");
    return { deleted: true as const };
  },
});

/**
 * How many more images this post may embed. The editor asks before opening a
 * file picker so it can disable the control with a reason, rather than letting
 * someone pick a file and then refusing it.
 */
export const remainingImageBudgetAction = createAction({
  name: "blog.imageBudget",
  input: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, ctx) => {
    const post = await getPost(ctx.userId, id);
    const limit = maxImagesPerPost();
    const used = countBodyImages(post.body);
    return { limit, used, remaining: Math.max(0, limit - used) };
  },
});

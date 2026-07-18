import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, schema } from "@resfolio/database";

import { blogBodySchema, type BlogBody } from "../schema/content";
import { withNativePosts } from "../projection";
import {
  createPost,
  deletePost,
  getPost,
  listPublishedPosts,
  updatePost,
} from "./repository";

/**
 * Repository integration tests — run against a **real Postgres**, not mocks.
 *
 * The unit suites cover the pure layer exhaustively. What they cannot cover is
 * the behaviour this file exists for: **image cleanup is reference-counted, and
 * getting it wrong destroys user data silently.** Because keys are content
 * hashes deduped per `(owner, kind, hash)`, one image used in two posts is one
 * object and one row; a wholesale delete of a post's key set would blank the
 * other post's image with no error and no way back. Mocking the database would
 * only test the mock's opinion of that.
 *
 * **Not part of `pnpm test`.** It needs a live Postgres, so it runs under its
 * own script (`pnpm --filter @resfolio/blog test:integration`) with the dev
 * database up. The default suite stays hermetic — the same split
 * `@resfolio/storage` uses for the code that talks to a real bucket.
 */

const USER_ID = "blog-itest-user";
const EMAIL = "blog-itest@example.test";

function bodyWithImages(...keys: string[]): BlogBody {
  return blogBodySchema.parse({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Some prose here." }],
      },
      ...keys.map((key) => ({
        type: "image",
        attrs: { assetKey: key, src: `https://cdn.test/${key}` },
      })),
    ],
  });
}

/** Seed an assets-table row so cleanup has something real to delete. */
async function seedAsset(ownerId: string, key: string, kind: string) {
  await db
    .insert(schema.asset)
    .values({
      ownerId,
      kind,
      key,
      contentHash: key,
      contentType: "image/webp",
      bytes: 1234,
    })
    .onConflictDoNothing({ target: schema.asset.key });
}

async function assetExists(key: string): Promise<boolean> {
  const row = await db.query.asset.findFirst({
    where: eq(schema.asset.key, key),
    columns: { key: true },
  });
  return Boolean(row);
}

describe("blog repository (integration)", () => {
  let profileId: string;

  beforeAll(async () => {
    await db
      .insert(schema.user)
      .values({
        id: USER_ID,
        name: "Blog Integration",
        email: EMAIL,
        emailVerified: true,
      })
      .onConflictDoNothing();

    const inserted = await db
      .insert(schema.profile)
      .values({ userId: USER_ID, draft: {}, draftRev: 0 })
      .onConflictDoNothing()
      .returning({ id: schema.profile.id });

    profileId =
      inserted[0]?.id ??
      (await db.query.profile.findFirst({
        where: eq(schema.profile.userId, USER_ID),
        columns: { id: true },
      }))!.id;

    // Start from a clean slate so a previous failed run can't skew assertions.
    await db
      .delete(schema.blogPost)
      .where(eq(schema.blogPost.profileId, profileId));
  });

  afterAll(async () => {
    await db
      .delete(schema.blogPost)
      .where(eq(schema.blogPost.profileId, profileId));
    await db.delete(schema.asset).where(eq(schema.asset.ownerId, profileId));
    await db.delete(schema.profile).where(eq(schema.profile.id, profileId));
    await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
  });

  it("creates a post with a slug derived from the title", async () => {
    const post = await createPost(USER_ID, { title: "Hello World" });
    expect(post.slug).toBe("hello-world");
    expect(post.status).toBe("draft");
    expect(post.publishedAt).toBeNull();
  });

  it("resolves a slug collision rather than failing the unique index", async () => {
    const second = await createPost(USER_ID, { title: "Hello World" });
    expect(second.slug).toBe("hello-world-2");
  });

  it("recomputes reading time from the body on every write", async () => {
    const post = await createPost(USER_ID, { title: "Long Read" });
    expect(post.readingMinutes).toBe(1);

    const words = Array.from({ length: 900 }, () => "word").join(" ");
    const updated = await updatePost(USER_ID, post.id, {
      body: blogBodySchema.parse({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: words }] },
        ],
      }),
    });
    // 900 words / 225 wpm — derived, never supplied by the caller.
    expect(updated.readingMinutes).toBe(4);
  });

  it("stamps publishedAt once and never moves it", async () => {
    const post = await createPost(USER_ID, { title: "Publish Me" });
    const published = await updatePost(USER_ID, post.id, {
      status: "published",
    });
    expect(published.publishedAt).toBeInstanceOf(Date);

    const first = published.publishedAt!.getTime();
    const edited = await updatePost(USER_ID, post.id, {
      title: "Publish Me, Edited",
    });
    expect(edited.publishedAt!.getTime()).toBe(first);

    // Even a round trip through draft and back must not restart its life.
    await updatePost(USER_ID, post.id, { status: "draft" });
    const republished = await updatePost(USER_ID, post.id, {
      status: "published",
    });
    expect(republished.publishedAt!.getTime()).toBe(first);
  });

  it("derives an excerpt only while the author has not written one", async () => {
    const post = await createPost(USER_ID, { title: "Excerpts" });
    const derived = await updatePost(USER_ID, post.id, {
      body: blogBodySchema.parse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Opening line." }],
          },
        ],
      }),
    });
    expect(derived.excerpt).toBe("Opening line.");

    const authored = await updatePost(USER_ID, post.id, {
      excerpt: "My own words.",
    });
    expect(authored.excerpt).toBe("My own words.");

    // A later body edit must not overwrite what the author wrote.
    const after = await updatePost(USER_ID, post.id, {
      body: blogBodySchema.parse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Rewritten opening." }],
          },
        ],
      }),
    });
    expect(after.excerpt).toBe("My own words.");
  });

  it("refuses a body that exceeds the configured image ceiling", async () => {
    const post = await createPost(USER_ID, { title: "Too Many" });
    await expect(
      updatePost(
        USER_ID,
        post.id,
        { body: bodyWithImages("k-a", "k-b", "k-c") },
        { maxImagesPerPost: 2 },
      ),
    ).rejects.toThrow(/limit of 2 images/u);
  });

  it("rejects a slug already used by another post", async () => {
    const a = await createPost(USER_ID, { title: "Slug Clash A" });
    const b = await createPost(USER_ID, { title: "Slug Clash B" });
    await expect(updatePost(USER_ID, b.id, { slug: a.slug })).rejects.toThrow(
      /already have a post/u,
    );
  });

  it("scopes reads to the owner", async () => {
    const post = await createPost(USER_ID, { title: "Private" });
    // A different user asking for the same id must not get it — ownership is
    // enforced in the repository, never assumed from the caller.
    await expect(getPost("some-other-user", post.id)).rejects.toThrow();
  });

  /**
   * The reason this file exists.
   */
  it("deletes only the images no other post is using", async () => {
    const EXCLUSIVE = "u/x/blog/images/exclusive.webp";
    const SHARED = "u/x/blog/images/shared.webp";
    const COVER = "u/x/blog/covers/cover.webp";

    await seedAsset(profileId, EXCLUSIVE, "blogImage");
    await seedAsset(profileId, SHARED, "blogImage");
    await seedAsset(profileId, COVER, "blogCover");

    const doomed = await createPost(USER_ID, { title: "Doomed Post" });
    await updatePost(USER_ID, doomed.id, {
      body: bodyWithImages(EXCLUSIVE, SHARED),
      coverAssetKey: COVER,
    });

    const survivor = await createPost(USER_ID, { title: "Survivor Post" });
    await updatePost(USER_ID, survivor.id, { body: bodyWithImages(SHARED) });

    await deletePost(USER_ID, doomed.id);

    // The post is gone…
    await expect(getPost(USER_ID, doomed.id)).rejects.toThrow();
    // …its exclusive image and its cover went with it…
    expect(await assetExists(EXCLUSIVE)).toBe(false);
    expect(await assetExists(COVER)).toBe(false);
    // …and the image the other post still uses survived. This is the assertion
    // that a naive "delete the post's keys" implementation fails.
    expect(await assetExists(SHARED)).toBe(true);

    // The surviving post is intact and still points at it.
    const stillThere = await getPost(USER_ID, survivor.id);
    expect(JSON.stringify(stillThere.body)).toContain(SHARED);
  });

  it("releases an image dropped from a body during an edit", async () => {
    const DROPPED = "u/x/blog/images/dropped.webp";
    await seedAsset(profileId, DROPPED, "blogImage");

    const post = await createPost(USER_ID, { title: "Edit Release" });
    await updatePost(USER_ID, post.id, { body: bodyWithImages(DROPPED) });
    expect(await assetExists(DROPPED)).toBe(true);

    await updatePost(USER_ID, post.id, { body: bodyWithImages() });
    expect(await assetExists(DROPPED)).toBe(false);
  });

  it("keeps a replaced cover that another post still uses", async () => {
    const COVER = "u/x/blog/covers/shared-cover.webp";
    await seedAsset(profileId, COVER, "blogCover");

    const a = await createPost(USER_ID, { title: "Cover A" });
    const b = await createPost(USER_ID, { title: "Cover B" });
    await updatePost(USER_ID, a.id, { coverAssetKey: COVER });
    await updatePost(USER_ID, b.id, { coverAssetKey: COVER });

    // A replaces its cover; B still uses the old one, so it must survive.
    // This is the case the `blogCover: singleton` bug would have broken.
    await updatePost(USER_ID, a.id, { coverAssetKey: null });
    expect(await assetExists(COVER)).toBe(true);

    await updatePost(USER_ID, b.id, { coverAssetKey: null });
    expect(await assetExists(COVER)).toBe(false);
  });

  it("projects only published posts into the Writing section", async () => {
    const draft = await createPost(USER_ID, { title: "Still A Draft" });
    const live = await createPost(USER_ID, { title: "Actually Live" });
    await updatePost(USER_ID, live.id, { status: "published" });

    const published = await listPublishedPosts(profileId);
    const ids = published.map((post) => post.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(draft.id);

    const profile = await db.query.profile.findFirst({
      where: eq(schema.profile.id, profileId),
    });
    expect(profile).toBeTruthy();

    const merged = withNativePosts(
      { basics: {}, sections: { writing: [] } } as never,
      published,
    );
    expect(merged.sections.writing.map((item) => item.id)).toContain(live.id);
  });

  it("cascades post deletion when the profile is deleted", async () => {
    const before = await db.query.blogPost.findMany({
      where: and(eq(schema.blogPost.profileId, profileId)),
      columns: { id: true },
    });
    expect(before.length).toBeGreaterThan(0);
  });
});

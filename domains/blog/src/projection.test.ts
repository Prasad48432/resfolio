import { buildProfileView, createEmptyProfile } from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import { postToWritingItem, withNativePosts } from "./projection";
import { emptyBlogBody } from "./schema/content";
import type { BlogPostRecord } from "./schema/post";

function post(overrides: Partial<BlogPostRecord> = {}): BlogPostRecord {
  return {
    id: "post-1",
    profileId: "profile-1",
    title: "On Writing",
    slug: "on-writing",
    excerpt: "A short excerpt.",
    body: emptyBlogBody(),
    coverAssetKey: null,
    tags: [],
    status: "published",
    readingMinutes: 3,
    seoTitle: null,
    seoDescription: null,
    publishedAt: new Date("2026-03-04T12:00:00Z"),
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-04T12:00:00Z"),
    ...overrides,
  };
}

describe("postToWritingItem", () => {
  it("maps a post onto the Writing item shape", () => {
    expect(postToWritingItem(post())).toEqual({
      id: "post-1",
      source: "manual",
      title: "On Writing",
      publisher: "",
      date: "2026-03-04",
      summary: "A short excerpt.",
    });
  });

  it("leaves the date absent for a never-published post", () => {
    expect(postToWritingItem(post({ publishedAt: null })).date).toBeUndefined();
  });

  it("formats the date in UTC so it cannot shift by a day", () => {
    // A late-evening UTC instant is the next day in some zones and the same day
    // in others; using UTC parts makes the answer independent of the server.
    const late = post({ publishedAt: new Date("2026-03-04T23:30:00Z") });
    expect(postToWritingItem(late).date).toBe("2026-03-04");
  });
});

describe("withNativePosts", () => {
  it("returns the profile untouched when there is nothing published", () => {
    const profile = createEmptyProfile();
    expect(withNativePosts(profile, [])).toBe(profile);
    expect(withNativePosts(profile, [post({ status: "draft" })])).toBe(profile);
  });

  it("never mutates the input profile", () => {
    const profile = createEmptyProfile();
    withNativePosts(profile, [post()]);
    expect(profile.sections.writing).toHaveLength(0);
  });

  it("omits drafts", () => {
    const merged = withNativePosts(createEmptyProfile(), [
      post({ id: "a", status: "published" }),
      post({ id: "b", status: "draft" }),
    ]);
    expect(merged.sections.writing.map((item) => item.id)).toEqual(["a"]);
  });

  it("places native posts before imported references", () => {
    const profile = createEmptyProfile();
    profile.sections.writing = [
      {
        id: "imported-1",
        source: "rss",
        title: "Imported",
        publisher: "Some Blog",
        summary: "",
      },
    ];
    const merged = withNativePosts(profile, [post({ id: "native-1" })]);
    expect(merged.sections.writing.map((item) => item.id)).toEqual([
      "native-1",
      "imported-1",
    ]);
  });

  it("lets a post win over an imported reference with the same id", () => {
    const profile = createEmptyProfile();
    profile.sections.writing = [
      {
        id: "post-1",
        source: "rss",
        title: "Stale copy",
        publisher: "X",
        summary: "",
      },
    ];
    const merged = withNativePosts(profile, [post({ id: "post-1" })]);
    expect(merged.sections.writing).toHaveLength(1);
    expect(merged.sections.writing[0]?.title).toBe("On Writing");
  });

  it("flows through buildProfileView into the writing section", () => {
    // The real integration check: a renderer consuming a ProfileView sees the
    // post with no knowledge that the blog domain exists.
    const profile = createEmptyProfile();
    profile.basics.name = "Ada";
    const view = buildProfileView(withNativePosts(profile, [post()]));
    const writing = view.sections.find((section) => section.key === "writing");
    expect(writing?.items).toHaveLength(1);
    expect(writing?.items[0]).toMatchObject({ title: "On Writing" });
  });
});

import { requireSession } from "@resfolio/auth";
import { listPosts } from "@resfolio/blog/server";
import { getOrCreateProfile } from "@resfolio/profile/server";

import { ProfileEditor } from "@/components/profile/profile-editor";

/**
 * The profile editor route — the product's default screen and source of
 * truth (docs/architecture/08-dashboard-ux.md). Reads (or seeds) the draft
 * server-side via the domain, then hands it to the client editor island.
 * Defense in depth: the page guards its own session, not just the layout.
 *
 * Published blog posts are read alongside the draft and shown **read-only** in
 * the Writing section. They are not part of the profile document — they are
 * projected into the Writing list at render time by `@resfolio/blog` — but the
 * section they land in would otherwise look empty here, and an automatic
 * behaviour the user cannot see reads as a broken one.
 */
export default async function ProfilePage() {
  const { user } = await requireSession();
  const draft = await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });
  const posts = await listPosts(user.id);

  return (
    <ProfileEditor
      initialDraft={draft.data}
      initialRev={draft.draftRev}
      publishedVersion={draft.publishedVersion}
      initialHasUnpublishedChanges={draft.hasUnpublishedChanges}
      nativePosts={posts
        .filter((post) => post.status === "published")
        .map((post) => ({
          id: post.id,
          title: post.title,
          excerpt: post.excerpt,
          // Formatted on the server so the client island renders no dates and
          // hydration cannot disagree about the viewer's locale.
          publishedOn: post.publishedAt
            ? post.publishedAt.toISOString().slice(0, 10)
            : "Unpublished",
          readingMinutes: post.readingMinutes,
          tagCount: post.tags.length,
        }))}
    />
  );
}

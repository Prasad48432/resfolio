import type { Profile, WritingItem } from "@resfolio/profile";

import type { BlogPostRecord } from "./schema/post";

/**
 * Projecting native posts into the Profile's Writing section.
 *
 * ## Why this lives here and not in `@resfolio/profile`
 *
 * `buildProfileView` is pure, deterministic, and knows nothing about the
 * database — that is what lets the dashboard run it in the browser for the
 * optimistic preview (doc 08). Teaching it to fetch posts would break all
 * three properties. Instead this is a **pure merge applied before the
 * projection**: callers that have posts pass `withNativePosts(profile, posts)`
 * to `buildProfileView`, and callers that don't (the preview island, every
 * existing test) are entirely unaffected.
 *
 * The dependency runs one way — `blog` knows about `profile`, never the
 * reverse — so there is no cycle, and the profile engine keeps its single
 * responsibility.
 *
 * ## Why the ProfileView is the integration point
 *
 * The requirement is that posts become part of the Writing section and that the
 * Profile stays the source of truth. The **ProfileView** is what every renderer
 * actually consumes (doc 01), so merging here means a résumé, a portfolio and
 * the public site all see one Writing list in which a native post and an
 * article imported from RSS are the same shape. No renderer needs a special
 * case, and none of them needs to know the blog domain exists.
 */

/**
 * A published post as a Writing entry.
 *
 * `source` stays `"manual"`: a native post was written by the user here, which
 * is exactly what that value means. Adding a `"resfolio"` source would widen an
 * enum that is additive-only (removing a value later would invalidate stored
 * items) to describe something the existing vocabulary already covers.
 *
 * `publisher` is deliberately empty — the author *is* the publisher, and
 * writing "Resfolio" there would put our brand in the user's résumé.
 *
 * `url` is absent for now. A post's public URL is a function of the owner's
 * site slug, which does not exist at this layer and is not resolved until
 * rendering ships. Absent is honest; a wrong URL would be worse than none, and
 * `optionalField` already models "no link yet" throughout the schema.
 */
export function postToWritingItem(post: BlogPostRecord): WritingItem {
  return {
    // The post id doubles as the item id: stable, already unique, and it makes
    // a Writing entry traceable back to the post it came from.
    id: post.id,
    source: "manual",
    title: post.title,
    publisher: "",
    date: toCalendarDate(post.publishedAt),
    summary: post.excerpt,
  };
}

/** `Date` → the profile schema's `YYYY-MM-DD` calendar date. Uses UTC parts so
 * the date does not shift by a day depending on where the server runs. */
function toCalendarDate(value: Date | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A copy of `profile` with published posts merged into `sections.writing`.
 *
 * Pure — the input profile is never mutated, because callers hand the same
 * object to autosave and to the view builder.
 *
 * Native posts sort **before** imported references, and posts are expected to
 * arrive newest-first (`listPublishedPosts` orders by `publishedAt desc`). A
 * post someone wrote here is the writing they most want seen; ordering is still
 * the user's to override through the ViewDefinition, which applies after this.
 *
 * Only published posts belong in a view. Drafts are filtered here rather than
 * trusted from the caller, so no surface can leak one by passing the wrong
 * list.
 */
export function withNativePosts(
  profile: Profile,
  posts: readonly BlogPostRecord[],
): Profile {
  const published = posts.filter((post) => post.status === "published");
  if (published.length === 0) {
    return profile;
  }

  const projected = published.map(postToWritingItem);
  // A post id colliding with an existing writing item's id would produce two
  // entries React renders under one key; the post wins, since it is the live
  // record and the reference is a stale import of the same thing.
  const projectedIds = new Set(projected.map((item) => item.id));

  return {
    ...profile,
    sections: {
      ...profile.sections,
      writing: [
        ...projected,
        ...profile.sections.writing.filter(
          (item) => !projectedIds.has(item.id),
        ),
      ],
    },
  };
}

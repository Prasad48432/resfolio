import type { BlogBody } from "./schema/content";
import type { BlogPostRecord } from "./schema/post";
import { resolveSeo } from "./schema/post";

/**
 * `PostView` — the render contract for a single post.
 *
 * The exact counterpart of `ProfileView` (doc 01/05), and here for the same
 * reason: a renderer must never receive a database record. `BlogPostRecord`
 * carries `profileId`, `coverAssetKey`, `status`, `createdAt`/`updatedAt` —
 * ownership and lifecycle facts a template has no business seeing and that we
 * are not willing to freeze into a public contract. This is the projection that
 * strips them.
 *
 * The rules match `ProfileView`'s exactly:
 * - **Pure and synchronous.** No database, no clock, no I/O. `buildPostView`
 *   is a function of its arguments, which is what keeps the render
 *   deterministic (doc 09) and cacheable.
 * - **Additive-only within a major.** New fields may appear; existing ones
 *   never change meaning or vanish.
 * - **Dates are calendar strings**, never `Date`. A `Date` would serialize
 *   through the RSC boundary carrying a timezone, and the same post would
 *   render a different day depending on where the server ran.
 * - **Keys are resolved to URLs here**, so no template needs to know what R2
 *   is (doc 07).
 *
 * The **body is not flattened to HTML**. It stays the validated node tree, and
 * the SDK's `renderPostBody` turns it into React. Serving HTML from here would
 * mean the whitelist stopped being the thing that makes markup unrepresentable
 * — it would become a string that merely happens to be safe today.
 */
export interface PostView {
  id: string;
  title: string;
  /** The post's URL segment; the renderer owns the base path. */
  slug: string;
  excerpt: string;
  body: BlogBody;
  /** Resolved absolute URL, or undefined when storage isn't configured. */
  coverImage?: string;
  tags: string[];
  readingMinutes: number;
  /** `YYYY-MM-DD` (UTC), or undefined for a post that was never published. */
  publishedOn?: string;
  /** Title/description with the domain's fallbacks already applied. */
  seo: { title: string; description: string };
}

export interface BuildPostViewOptions {
  /** Public base URL for stored assets; absent omits the cover. */
  assetBaseUrl?: string;
}

/**
 * Project a stored post onto the render contract.
 *
 * Note this does **not** check `status`. Callers decide what may be rendered,
 * and the only readers that reach a template — `getPublishedPostBySlug` and
 * `listPublishedPosts` — return published rows by construction. Re-checking
 * here would imply a caller could safely pass a draft, which is the opposite
 * of the guarantee.
 */
export function buildPostView(
  post: BlogPostRecord,
  options: BuildPostViewOptions = {},
): PostView {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    coverImage:
      post.coverAssetKey && options.assetBaseUrl
        ? `${options.assetBaseUrl.replace(/\/$/, "")}/${post.coverAssetKey}`
        : undefined,
    tags: post.tags,
    readingMinutes: post.readingMinutes,
    publishedOn: toCalendarDate(post.publishedAt),
    seo: resolveSeo(post),
  };
}

/** `Date` → `YYYY-MM-DD` from UTC parts, so the day never shifts with the
 * server's zone. Mirrors the Writing projection's helper deliberately: the two
 * describe the same instant and must agree. */
function toCalendarDate(value: Date | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

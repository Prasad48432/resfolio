/**
 * @resfolio/blog — the blog domain (docs/architecture/07-storage.md,
 * 01-profile-engine.md).
 *
 * A post is profile-owned writing: its own row, its own draft/published state,
 * and a structured body. The Profile stays the source of truth for *identity* —
 * published posts are projected into its Writing section by `buildProfileView`,
 * so every renderer sees one Writing list whether an entry is a native post or
 * a reference imported from RSS.
 *
 * **The root is pure and framework-free**, like `@resfolio/profile`'s: schema,
 * derived-value helpers, and types. No database, no TipTap, no `node:*`. That
 * is what lets the editor island import `blogBodySchema` and validate exactly
 * what the server will, instead of keeping a second copy that drifts.
 * `./server` is the only database-aware surface.
 */

export {
  blogBodySchema,
  blogMarkSchema,
  calloutToneSchema,
  emptyBlogBody,
  CALLOUT_TONES,
  HEADING_LEVELS,
  MAX_BODY_DEPTH,
  type BlogBody,
  type BlogMark,
  type BlogNode,
  type CalloutTone,
} from "./schema/content";

export {
  blogBodyText,
  collectBodyAssetKeys,
  countBodyImages,
  deriveExcerpt,
  formatReadingTime,
  readingMinutes,
  slugify,
  uniqueSlug,
  WORDS_PER_MINUTE,
} from "./schema/derive";

export {
  blogPostStatusSchema,
  blogSlugSchema,
  blogTagsSchema,
  newBlogPostInput,
  resolveSeo,
  updateBlogPostSchema,
  BLOG_POST_STATUSES,
  DEFAULT_MAX_IMAGES_PER_POST,
  type BlogPostRecord,
  type BlogPostStatus,
  type NewBlogPostInput,
  type UpdateBlogPostInput,
} from "./schema/post";

export {
  postToWritingItem,
  withNativePosts,
  type ProjectPostOptions,
} from "./projection";

export {
  buildPostView,
  type BuildPostViewOptions,
  type PostView,
} from "./view";

export {
  BlogDataError,
  BlogImageLimitError,
  BlogPostNotFoundError,
  BlogSlugTakenError,
} from "./errors";

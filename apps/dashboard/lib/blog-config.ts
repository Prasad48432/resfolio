import "server-only";

import { DEFAULT_MAX_IMAGES_PER_POST } from "@resfolio/blog";

import { env } from "./env";

/**
 * The configured ceiling on images per post.
 *
 * The requirement was that this be configurable rather than hardcoded, so the
 * number lives in the environment (`BLOG_MAX_IMAGES_PER_POST`) with the
 * domain's default as the fallback. One accessor rather than reading `env`
 * at each call site, so the upload route, the editor's budget check and the
 * repository's enforcement can never disagree about what the limit is.
 */
export function maxImagesPerPost(): number {
  return env.BLOG_MAX_IMAGES_PER_POST ?? DEFAULT_MAX_IMAGES_PER_POST;
}

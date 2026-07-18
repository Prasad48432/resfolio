/**
 * Blog domain errors (docs/architecture/06-api-architecture.md). Expected
 * failures Server Actions can translate into typed `ActionResult`s; unexpected
 * ones bubble to the generic error path.
 */

export class BlogPostNotFoundError extends Error {
  constructor() {
    super("Post not found.");
    this.name = "BlogPostNotFoundError";
  }
}

export class BlogDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlogDataError";
  }
}

/** A slug the owner is already using for another post. Surfaced to the user as
 * a field error on the slug input, not a generic failure. */
export class BlogSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`You already have a post at "${slug}".`);
    this.name = "BlogSlugTakenError";
  }
}

/** The post is at its image ceiling (`maxImagesPerPost`). Thrown by the upload
 * path *before* bytes reach R2, so a refused upload costs nothing. */
export class BlogImageLimitError extends Error {
  constructor(readonly limit: number) {
    super(`This post has reached its limit of ${limit} images.`);
    this.name = "BlogImageLimitError";
  }
}

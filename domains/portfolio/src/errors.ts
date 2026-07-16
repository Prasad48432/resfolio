/**
 * Portfolio domain errors (docs/architecture/06-api-architecture.md). Expected
 * failures Server Actions translate into typed `ActionResult`s; unexpected ones
 * bubble to the generic error path.
 */

export class SiteNotFoundError extends Error {
  constructor() {
    super("Site not found.");
    this.name = "SiteNotFoundError";
  }
}

export class SiteDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteDataError";
  }
}

/** The requested slug is already claimed by another site. */
export class SlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`The name "${slug}" is already taken.`);
    this.name = "SlugTakenError";
  }
}

/** Publishing a site whose profile has never been published. */
export class ProfileNotPublishedError extends Error {
  constructor() {
    super("Publish your profile before publishing your site.");
    this.name = "ProfileNotPublishedError";
  }
}

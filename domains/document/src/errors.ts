/**
 * Document domain errors (docs/architecture/06-api-architecture.md). Expected
 * failures Server Actions can translate into typed `ActionResult`s; unexpected
 * ones bubble to the generic error path.
 */

export class DocumentNotFoundError extends Error {
  constructor() {
    super("Document not found.");
    this.name = "DocumentNotFoundError";
  }
}

export class DocumentDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentDataError";
  }
}

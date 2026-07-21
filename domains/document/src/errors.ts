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

/**
 * A user already has a document built on this template. Resumes are one-per
 * template (a template already renders the whole profile — a second copy on the
 * same template is a duplicate, not a new document), so `createDocument` refuses
 * the second and the action turns this into a "edit your existing one" message.
 */
export class DuplicateTemplateError extends Error {
  constructor(readonly templateId: string) {
    super(`A document already exists for template "${templateId}".`);
    this.name = "DuplicateTemplateError";
  }
}

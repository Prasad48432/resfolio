/**
 * @resfolio/document — the document engine
 * (docs/architecture/07-storage.md, 09-rendering-pipeline.md). A document is a
 * `Profile × config` rendering: template + presentation config + ViewDefinition.
 *
 * This entry point is pure and framework-free — safe to import (for types) from
 * server code, the client editor island, and tests alike. Database operations
 * live at `@resfolio/document/server`.
 *
 * There is no `./token` subpath any more: a resume has a permanent URL guarded
 * by its own `visibility` (doc 02), so nothing needs a signed, expiring
 * capability to read one. The remaining server-to-server calls into the render
 * host use a plain bearer (`RENDER_SECRET`), and the portfolio draft preview
 * keeps its own token at `@resfolio/portfolio/token`.
 */
export {
  DocumentNotFoundError,
  DocumentDataError,
  DuplicateTemplateError,
} from "./errors";

export {
  DOCUMENT_KINDS,
  DOCUMENT_VISIBILITIES,
  documentKindSchema,
  documentConfigSchema,
  documentVisibilitySchema,
  newResumeDocumentInput,
  updateDocumentSchema,
  type DocumentConfig,
  type DocumentKind,
  type DocumentRecord,
  type DocumentVisibility,
  type NewDocumentInput,
  type UpdateDocumentInput,
} from "./schema";

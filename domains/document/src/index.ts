/**
 * @resfolio/document — the document engine
 * (docs/architecture/07-storage.md, 09-rendering-pipeline.md). A document is a
 * `Profile × config` rendering: template + presentation config + ViewDefinition.
 *
 * This entry point is pure and framework-free — safe to import (for types) from
 * server code, the client editor island, and tests alike. The signed render
 * token lives at `@resfolio/document/token` (server-only, `node:crypto`);
 * database operations live at `@resfolio/document/server`.
 */
export { DocumentNotFoundError, DocumentDataError } from "./errors";

export {
  DOCUMENT_KINDS,
  documentKindSchema,
  documentConfigSchema,
  newResumeDocumentInput,
  updateDocumentSchema,
  type DocumentConfig,
  type DocumentKind,
  type DocumentRecord,
  type NewDocumentInput,
  type UpdateDocumentInput,
} from "./schema";

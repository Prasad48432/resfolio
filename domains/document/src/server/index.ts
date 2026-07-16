/**
 * @resfolio/document/server — database-backed document operations
 * (docs/architecture/07-storage.md). Kept separate from the package root so the
 * pure contract (schema, types, helpers) can be imported into client components
 * and tests without pulling in the database client.
 */
export {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentForRender,
  listDocuments,
  updateDocument,
  type DocumentRenderSpec,
} from "./repository";

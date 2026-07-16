/**
 * @resfolio/integrations/server — the database-backed import runtime
 * (docs/architecture/12-integrations-and-sync.md). Kept separate from the
 * pure root (contract, candidate schema, routing policy, fingerprint,
 * classify, connectors) so connectors and the workspace UI's types never
 * pull in the database client.
 *
 * Surface: connection CRUD (owner-scoped), the workspace reads
 * (`listPendingItems` for triage, `listImportReceipts` for history),
 * `runImport` (fetch → normalize → route → stage with import-semantics
 * classification), and `importItem`/`dismissItem`/`routeItem` (Review →
 * Import — an ordinary profile draft mutation behind a user click). Token
 * encryption is AES-256-GCM, key-versioned (`./crypto`), decrypted only
 * inside the import runtime.
 */
export {
  CONNECTION_STATUSES,
  IMPORTABLE_STATES,
  ITEM_STATES,
  createConnection,
  deleteConnection,
  dismissItem,
  listConnections,
  listImportReceipts,
  listImportRuns,
  listPendingItems,
  routeItem,
  type ConnectionRecord,
  type ConnectionStatus,
  type ImportReceiptRecord,
  type ImportRunRecord,
  type ItemState,
  type NewConnectionInput,
  type PendingItemRecord,
} from "./repository";

export {
  runImport,
  type ImportCounts,
  type ImportRunSummary,
} from "./import-run";

export {
  importItem,
  type ImportItemOptions,
  type ImportResult,
} from "./import";

export {
  encryptSecret,
  decryptSecret,
  keyringFromHex,
  type TokenKeyring,
} from "./crypto";

export {
  ConnectionNotFoundError,
  IntegrationDataError,
  StagedItemNotFoundError,
  TokenCryptoError,
  TokenKeyMissingError,
  UnknownConnectorError,
} from "./errors";

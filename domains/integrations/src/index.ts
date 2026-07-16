/**
 * @resfolio/integrations — the imports domain
 * (docs/architecture/12-integrations-and-sync.md). One pipeline for every
 * provider: **Connect → Fetch → Normalize → Route → Stage → Review → Import**.
 * Each provider is a small connector (`fetch` + pure `normalize`) behind a
 * static registry, declaring its auth mode and whether it is `refreshable`.
 * Providers are import sources only: imported content becomes ordinary
 * Resfolio data, and the Profile stays the single source of truth by
 * construction — a candidate never reaches the Profile except through the
 * Sources workspace and an ordinary `@resfolio/profile` draft mutation.
 *
 * This root is pure and framework/DB-free (like every `domains/*` root). The
 * runtime (encrypted token storage, staging tables, `runImport`,
 * `importItem`) lives in the `./server` surface; connectors' live `fetch` is
 * exercised there against a runtime-provided `FetchContext`.
 */
export {
  defineConnector,
  AUTH_MODES,
  CONNECTOR_TIERS,
  type AuthMode,
  type ConnectorTier,
  type Connector,
  type AnyConnector,
  type ConnectorAuth,
  type ConnectorCapabilities,
  type FetchContext,
} from "./contract";

export {
  CANDIDATE_KINDS,
  METRIC_KEYS,
  ROUTE_CONFIDENCES,
  ROUTE_TARGETS,
  candidateKindSchema,
  candidateItemSchema,
  candidateMediaSchema,
  candidateMetricSchema,
  candidateRouteSchema,
  type CandidateKind,
  type CandidateItem,
  type CandidateMedia,
  type CandidateMetric,
  type CandidateRoute,
  type MetricKey,
  type RouteConfidence,
  type RouteTarget,
} from "./candidate";

export {
  COMPATIBLE_ROUTE_TARGETS,
  DEFAULT_ROUTE_FOR_KIND,
  assertRouteTarget,
  isRouteCompatible,
  resolveRoute,
} from "./routing";

export { computeFingerprint } from "./fingerprint";

export {
  buildBasicsPatch,
  buildProfileItem,
  contentFingerprint,
  detectUserEdit,
  extractAppliedPayload,
  sectionForKind,
  type BuiltProfileItem,
} from "./apply";

export {
  classifyCandidate,
  IMPORT_CLASSIFICATIONS,
  type ImportClassification,
  type ClassifyInput,
} from "./classify";

export {
  CONNECTORS,
  CONNECTOR_IDS,
  getConnector,
  listConnectors,
  type ConnectorId,
} from "./registry";

export { github, type GithubRepo } from "./connectors/github";
export {
  rss,
  rssInputSchema,
  parseFeed,
  type RssInput,
  type RssRawEntry,
} from "./connectors/rss";
export { devto, devtoInputSchema, type DevtoArticle, type DevtoInput } from "./connectors/devto";
export {
  stackoverflow,
  stackoverflowInputSchema,
  type StackoverflowInput,
  type StackoverflowRaw,
  type StackoverflowTag,
  type StackoverflowUser,
} from "./connectors/stackoverflow";
export {
  extractLinkedinExportFiles,
  linkedin,
  linkedinInputSchema,
  type LinkedinFiles,
  type LinkedinInput,
  type LinkedinRaw,
} from "./connectors/linkedin";
export { csvRecords, parseCsv } from "./connectors/csv";

export { CandidateApplyError, ConnectorDefinitionError } from "./errors";

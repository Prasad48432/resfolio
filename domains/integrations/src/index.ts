/**
 * @resfolio/integrations — the integrations domain
 * (docs/architecture/12-integrations-and-sync.md). One pipeline for every
 * provider: **Connect → Fetch → Normalize → Stage → Review → Apply**. Each
 * provider is a small connector (`fetch` + pure `normalize`) behind a static
 * registry, declaring its auth mode so public-feed providers stay nearly free
 * to add. The Profile stays the single source of truth by construction — a
 * candidate never reaches the Profile except through the review inbox and an
 * ordinary `@resfolio/profile` draft mutation.
 *
 * This root is pure and framework/DB-free (like every `domains/*` root). The
 * runtime (encrypted token storage, staging tables, scheduled sync,
 * apply-to-draft) lands in the `./server` surface next; connectors' live
 * `fetch` is exercised there against a runtime-provided `FetchContext`.
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
  type ConnectorSchedule,
  type FetchContext,
} from "./contract";

export {
  CANDIDATE_KINDS,
  METRIC_KEYS,
  candidateKindSchema,
  candidateItemSchema,
  candidateMediaSchema,
  candidateMetricSchema,
  type CandidateKind,
  type CandidateItem,
  type CandidateMedia,
  type CandidateMetric,
  type MetricKey,
} from "./candidate";

export { computeFingerprint } from "./fingerprint";

export {
  classifyCandidate,
  CANDIDATE_STATES,
  type CandidateState,
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

export { ConnectorDefinitionError } from "./errors";

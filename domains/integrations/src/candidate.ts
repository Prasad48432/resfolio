import {
  basicsSchema,
  customItemSchema,
  httpUrlSchema,
  projectItemSchema,
  writingItemSchema,
} from "@resfolio/profile";
import { z } from "zod";

/**
 * The canonical staging shape (docs/architecture/12-integrations-and-sync.md).
 * A `CandidateItem` is a *proposed* Profile item — never applied directly. Its
 * `payload` reuses the profile item schemas verbatim (minus provenance, which
 * Apply stamps: a fresh `createItemId()` → `id`, the provider → `source`, the
 * candidate's `externalId` → `sourceId`). Provider-specific richness is kept in
 * `raw` (staging only), never in the Profile; the one typed extension the
 * Profile layer sees is `metrics` (doc 12 — "★ 2.3k" without a template
 * knowing providers).
 *
 * Connectors map to **canonical kinds only**. When a provider field earns
 * first-class status that is a deliberate profile schema bump (doc 01), not
 * connector creep.
 */

/** Canonical resource kinds a connector may emit. Extend here + add the payload
 * variant below when a new kind gains a profile mapping (doc 12). */
export const CANDIDATE_KINDS = [
  "project",
  "contribution",
  "article",
  "talk",
  "profileBasics",
] as const;

export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export const candidateKindSchema = z.enum(CANDIDATE_KINDS);

/**
 * Metric vocabulary (doc 12 open question — seeded by the first two connectors,
 * left open for #3+). A narrow, typed extension point so templates can show
 * counts without knowing which provider produced them.
 */
export const METRIC_KEYS = [
  "stars",
  "forks",
  "followers",
  "reactions",
  "views",
  "reputation",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export const candidateMetricSchema = z.object({
  key: z.enum(METRIC_KEYS),
  value: z.number().finite().nonnegative(),
});

/** External media on a candidate. URLs are the provider's originals here; the
 * runtime rehosts them into R2 at stage time (doc 12) before they ever render —
 * [10-auth-and-security](../../docs/architecture/10-auth-and-security.md)'s CSP
 * allows images only from our hosts. */
export const candidateMediaSchema = z.object({
  role: z.enum(["cover", "avatar", "screenshot"]),
  url: httpUrlSchema,
});

/** Payloads = the profile item content, provenance stripped (Apply stamps it). */
const projectPayloadSchema = projectItemSchema.omit({
  id: true,
  source: true,
  sourceId: true,
});
const writingPayloadSchema = writingItemSchema.omit({
  id: true,
  source: true,
  sourceId: true,
});
const customPayloadSchema = customItemSchema.omit({
  id: true,
  source: true,
  sourceId: true,
});
const basicsPayloadSchema = basicsSchema.pick({
  name: true,
  headline: true,
  summary: true,
  location: true,
  avatarUrl: true,
});

/** Fields every candidate carries regardless of kind. */
const candidateBaseShape = {
  /** Stable provider identifier — the upsert key with `connectionId` (doc 12). */
  externalId: z.string().trim().min(1).max(256),
  /** The canonical outbound link (repo, article, …), if any. */
  url: httpUrlSchema.optional(),
  /** Human label for the review inbox row. */
  title: z.string().trim().min(1).max(300),
  media: z.array(candidateMediaSchema).max(8).default([]),
  metrics: z.array(candidateMetricSchema).max(12).default([]),
  /** The untouched provider payload — preserved in staging, never in the
   * Profile. Oversized payloads are pointered to R2 by the runtime (doc 12). */
  raw: z.unknown(),
};

/**
 * A staged candidate — discriminated on `kind` so each variant validates its
 * canonical payload precisely. `contribution` shares the project shape (an
 * external project the user contributed to); `talk` lands in a custom section.
 */
export const candidateItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    ...candidateBaseShape,
    payload: projectPayloadSchema,
  }),
  z.object({
    kind: z.literal("contribution"),
    ...candidateBaseShape,
    payload: projectPayloadSchema,
  }),
  z.object({
    kind: z.literal("article"),
    ...candidateBaseShape,
    payload: writingPayloadSchema,
  }),
  z.object({
    kind: z.literal("talk"),
    ...candidateBaseShape,
    payload: customPayloadSchema,
  }),
  z.object({
    kind: z.literal("profileBasics"),
    ...candidateBaseShape,
    payload: basicsPayloadSchema,
  }),
]);

export type CandidateItem = z.infer<typeof candidateItemSchema>;
export type CandidateMedia = z.infer<typeof candidateMediaSchema>;
export type CandidateMetric = z.infer<typeof candidateMetricSchema>;

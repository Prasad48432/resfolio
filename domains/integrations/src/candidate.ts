import {
  calendarDateSchema,
  certificationItemSchema,
  customItemSchema,
  educationItemSchema,
  experienceItemSchema,
  httpUrlSchema,
  profileLinkSchema,
  projectItemSchema,
  SECTION_KEYS,
  skillGroupSchema,
  writingItemSchema,
} from "@resfolio/profile";
import { z } from "zod";

/**
 * The canonical staging shape (docs/architecture/12-integrations-and-sync.md).
 * A `CandidateItem` is a *proposed* Profile item — never applied directly. Its
 * `payload` reuses the profile item schemas verbatim (minus provenance, which
 * Import stamps: a fresh `createItemId()` → `id`, the provider → `source`, the
 * candidate's `externalId` → `sourceId`). Provider-specific richness is kept in
 * `raw` (staging only), never in the Profile; the one typed extension the
 * Profile layer sees is `metrics` (doc 12 — "★ 2.3k" without a template
 * knowing providers).
 *
 * Connectors map to **canonical kinds only**. When a provider field earns
 * first-class status that is a deliberate profile schema bump (doc 01), not
 * connector creep. `unclassified` is the escape hatch that keeps that rule
 * from silently dropping data: a loose payload with no automatic destination —
 * it waits in the Sources workspace until the user routes it.
 *
 * **A connector may never propose the user's identity.** There is deliberately
 * no kind carrying `name`/`headline`/`summary`/`location`/`avatarUrl`: those
 * are the user's own words about themselves, and a provider's guess at them is
 * never worth the risk of overwriting the real thing. The one profile field
 * outside a section a connector may propose is a **link** (`profileLink`) — a
 * provider genuinely does know its own profile URL. Should LinkedIn direct
 * import ever land, importing identity is a deliberate decision reopened then,
 * not a door left ajar now.
 */

/** Canonical resource kinds a connector may emit. Extend here + add the payload
 * variant below when a new kind gains a profile mapping (doc 12). */
export const CANDIDATE_KINDS = [
  "project",
  "contribution",
  "article",
  "talk",
  "experience",
  "education",
  "skillGroup",
  "certification",
  "profileLink",
  "unclassified",
] as const;

export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export const candidateKindSchema = z.enum(CANDIDATE_KINDS);

/**
 * Routing metadata (doc 12 — routing is a named pipeline stage, and it is
 * data, not a constant). Where a candidate proposes to land: a profile
 * section key, `"links"` (an entry in `basics.links` — the only non-section
 * destination a connector has), or `null` — **unrouted**, the "needs a home"
 * state that keeps an item in the workspace until the user decides.
 * `suggested` means the destination must be shown, never assumed.
 */
export const ROUTE_TARGETS = [...SECTION_KEYS, "links"] as const;

export type RouteTarget = (typeof ROUTE_TARGETS)[number];

export const ROUTE_CONFIDENCES = ["certain", "suggested"] as const;

export type RouteConfidence = (typeof ROUTE_CONFIDENCES)[number];

export const candidateRouteSchema = z.object({
  sectionKey: z.enum(ROUTE_TARGETS).nullable(),
  confidence: z.enum(ROUTE_CONFIDENCES),
});

export type CandidateRoute = z.infer<typeof candidateRouteSchema>;

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

/** Payloads = the profile item content, provenance stripped (Import stamps it). */
const provenance = { id: true, source: true, sourceId: true } as const;
const projectPayloadSchema = projectItemSchema.omit(provenance);
const writingPayloadSchema = writingItemSchema.omit(provenance);
const customPayloadSchema = customItemSchema.omit(provenance);
const experiencePayloadSchema = experienceItemSchema.omit(provenance);
const educationPayloadSchema = educationItemSchema.omit(provenance);
const skillGroupPayloadSchema = skillGroupSchema.omit(provenance);
const certificationPayloadSchema = certificationItemSchema.omit(provenance);
/** A social/profile link — `{ label, url }`, the profile's own link shape minus
 * its id (Import mints one). `profileLinkSchema.url` is `safeLinkUrlSchema`, so
 * the scheme allowlist that protects hand-typed links protects imported ones. */
const profileLinkPayloadSchema = profileLinkSchema.omit({ id: true });

/** The escape hatch's loose payload: content a connector can't confidently
 * type. It has **no automatic destination** — the user routes it (doc 12,
 * "needs a home"). On import to a custom section it maps `text` → summary and
 * `date` → startDate. */
const unclassifiedPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(2000).default(""),
  url: httpUrlSchema.optional(),
  date: calendarDateSchema.optional(),
});

/** Fields every candidate carries regardless of kind. */
const candidateBaseShape = {
  /** Stable provider identifier — the upsert key with `connectionId` (doc 12). */
  externalId: z.string().trim().min(1).max(256),
  /** The canonical outbound link (repo, article, …), if any. */
  url: httpUrlSchema.optional(),
  /** Human label for the workspace row. */
  title: z.string().trim().min(1).max(300),
  /** Connector route override (e.g. a bio → basics as `suggested`). Omitted →
   * the kind's default route (`resolveRoute`). Never part of the fingerprint. */
  route: candidateRouteSchema.optional(),
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
    kind: z.literal("experience"),
    ...candidateBaseShape,
    payload: experiencePayloadSchema,
  }),
  z.object({
    kind: z.literal("education"),
    ...candidateBaseShape,
    payload: educationPayloadSchema,
  }),
  z.object({
    kind: z.literal("skillGroup"),
    ...candidateBaseShape,
    payload: skillGroupPayloadSchema,
  }),
  z.object({
    kind: z.literal("certification"),
    ...candidateBaseShape,
    payload: certificationPayloadSchema,
  }),
  z.object({
    kind: z.literal("profileLink"),
    ...candidateBaseShape,
    payload: profileLinkPayloadSchema,
  }),
  z.object({
    kind: z.literal("unclassified"),
    ...candidateBaseShape,
    payload: unclassifiedPayloadSchema,
  }),
]);

export type CandidateItem = z.infer<typeof candidateItemSchema>;
export type CandidateMedia = z.infer<typeof candidateMediaSchema>;
export type CandidateMetric = z.infer<typeof candidateMetricSchema>;

# 12 — Data Integrations & Synchronization

Status: Accepted

## Problem Statement

Users should connect external platforms (GitHub, GitLab, Dribbble, Medium,
Dev.to, Hashnode, RSS, YouTube, Figma, Notion, Product Hunt, CodePen,
LeetCode, Stack Overflow, Kaggle, Hugging Face, …) and pull their
professional content into Resfolio. The non-negotiable constraint: **the
Profile remains the single source of truth** — external data flows through an
import → normalization → review pipeline before it ever touches the Profile,
and imported data never silently overwrites user edits.

The design must make adding provider #19 a small, boring task; handle OAuth
and tokens safely; survive flaky third-party APIs, rate limits, and revoked
grants; and keep provider-specific junk out of the core Profile schema.

### Assumptions challenged first

- **LinkedIn: your instinct is correct — live sync is not possible.** The
  API is partner-gated (Sign-In/marketing scopes only; no profile-read for
  apps like ours) and scraping violates ToS and gets accounts flagged. The
  honest product answer is a **file import**: LinkedIn's official data
  export ZIP (Settings → Get a copy of your data) parses cleanly into
  positions, education, and skills. One-time import, clearly labeled — not a
  "connection."
- **Behance is effectively closed too** — Adobe stopped issuing API keys
  years ago. Treat it as a public-page (Tier C) provider or defer; don't
  promise it.
- **"Integration" ≠ "OAuth."** Most of this list needs no credentials at
  all: Medium is an RSS feed, Dev.to and Stack Overflow have public APIs
  keyed by username, Hashnode has a public GraphQL API, Hugging Face and
  Kaggle have public profiles, YouTube channels have public feeds. Forcing
  an OAuth-shaped architecture onto public feeds would make every new
  provider expensive. The connector contract below makes **auth mode a
  per-provider declaration**, which is the single biggest lever for "adding
  a provider is simple."
- **"Synchronization" is mostly "refresh."** Users don't need real-time
  mirroring; they need a great first import and low-effort freshness
  (new repo, new article shows up as a suggestion). Design for
  import-plus-periodic-refresh, with webhooks as a later optimization for
  the one provider where they're cheap (GitHub) — not as the foundation.

## Proposed Architecture

### The pipeline (one shape for every provider)

```
CONNECT            FETCH               NORMALIZE           STAGE                REVIEW              APPLY
grant/username → connector pulls  →  connector maps   →  candidate items   →  user approves,   →  domain merge into
or file upload    raw items           raw → canonical     diffed vs Profile    edits, dismisses    Profile DRAFT with
                  (Trigger.dev job)   CandidateItem       (Postgres staging)   (dashboard inbox)   provenance stamped
```

Nothing reaches the Profile except through **Apply**, which is an ordinary
`domains/profile` mutation on the _draft_ (so even accepted imports still go
through the user's publish step, per [01-profile-engine](01-profile-engine.md)).

### The connector contract — `@resfolio/integrations`

All integration logic lives in `domains/integrations`. Each provider is a
small module implementing one interface, registered in a static registry
(same pattern as templates, [05-template-sdk](05-template-sdk.md)):

```ts
export const github = defineConnector({
  id: "github",
  name: "GitHub",
  authMode: "oauth2",              // "oauth2" | "token" | "public" | "file"
  auth: { scopes: ["read:user", "public_repo"] },        // oauth2 only
  input: undefined,                 // "public": z.object({ username }) ; "file": accepted formats
  resources: ["project", "contribution"],   // what canonical kinds it emits
  capabilities: { incremental: true, webhooks: true },
  schedule: { defaultEvery: "24h" },

  // The only two functions a connector must implement:
  fetch:     (ctx) => AsyncIterable<RawItem>,   // ctx: credentials/input, cursor, rate budget, fetch()
  normalize: (raw) => CandidateItem[],          // pure: raw → canonical candidates
});
```

- `fetch` is the only place provider APIs are touched; it receives a
  pre-authenticated, rate-limited `fetch` from the runtime and yields raw
  items plus an updated cursor. `normalize` is **pure** (unit-testable
  against recorded fixtures — the same fixture discipline as
  [11-engineering-foundation](11-engineering-foundation.md)).
- Everything else — token refresh, retries, scheduling, staging, diffing,
  dedupe, media rehosting, the review UI — is the **runtime**, written
  once. A public-feed connector is realistically ~100 lines.

**CandidateItem** is the canonical staging shape: a proposed Profile item
(`kind: project | article | talk | contribution | profileBasics | …`, the
canonical fields from the profile schema) plus
`{ externalId, url, fingerprint, media[], raw }`.

### Auth modes and token security

- **`oauth2`** (GitHub, GitLab, Dribbble, Figma, Notion, Product Hunt):
  integration-scoped OAuth, completely separate from login OAuth (the seam
  reserved in [10-auth-and-security](10-auth-and-security.md)). Route
  handlers in `apps/dashboard` run the dance; scopes are minimal and read-only.
- **`token`** (providers offering PATs where OAuth is impractical): user
  pastes a token; validated with a test call before storing.
- **`public`** (Dev.to, Hashnode, Medium/RSS, Stack Overflow, YouTube feed,
  Hugging Face, Kaggle, CodePen, LeetCode): user supplies a
  username/URL — validated by fetching the profile. No credentials stored.
- **`file`** (LinkedIn export ZIP; later resume-PDF import): upload →
  presigned R2 → parse job → same staging pipeline. One-shot; no connection
  to keep alive.

Tokens (access + refresh) are **encrypted at rest** (AES-256-GCM,
per-column, key from validated env with a key-version byte for rotation),
stored in `integration_connections`, decrypted only inside the connector
runtime (Trigger.dev tasks / route handlers). Never logged
(Pino redaction, [11](11-engineering-foundation.md)), never sent to the
client, never in Redis. Refresh is centralized in the runtime; a failed
refresh or revoked grant flips the connection to `needs_reauth` and
notifies — it never retries into a lockout.

### Sync strategy: hybrid, polling-first

- **Manual "Sync now"** — always available, rate-limited per connection
  (Redis, [07-storage](07-storage.md)).
- **Scheduled refresh** — a Trigger.dev task per connection on a jittered
  per-provider cadence (default 24h; public feeds can be lazier). Uses the
  connector's cursor/ETag for incremental fetch where supported;
  fingerprints make full refetches cheap and idempotent anyway.
- **Webhooks** — an optimization, not a foundation: only where the provider
  makes them cheap and the value is real (GitHub push/repo events, phase 2+).
  Webhook receipt just enqueues the same sync task — one code path.

Idempotency by construction: candidates upsert on
`(connectionId, externalId)`; unchanged fingerprints are skipped; a Redis
lock allows one active sync per connection.

**Retries and failure classification** (runtime-owned): `401/403` →
`needs_reauth`, stop; `429` → respect `Retry-After`, backoff; `5xx`/network
→ exponential backoff via Trigger.dev retry policy; normalize errors →
capture to Sentry with the raw item, skip the item, never fail the run.
Every run writes an `integration_sync_runs` row (status, counts, duration,
error) — the observability surface for both support and the dashboard's
connection health UI.

Rate limiting is two-level in Redis: a **per-provider app budget** (e.g.
GitHub's 5k/hr across all users) and per-connection courtesy limits; the
runtime's `fetch` blocks on both, so connectors can't misbehave.

### Normalization, provenance, and the review inbox

- Connectors map to **canonical kinds only**. Provider-specific richness is
  preserved in the staging row's `raw` JSONB — never in the Profile. The
  canonical item schema gets exactly one narrow, typed extension point:
  `metrics?: { key: MetricKey, value: number }[]` (stars, followers,
  reputation…) so templates can show "★ 2.3k" without knowing providers.
  If a provider field earns first-class status, that's a deliberate profile
  schema version bump ([01](01-profile-engine.md)) — not connector creep.
- **Media is rehosted**: covers/screenshots/avatars are downloaded at stage
  time into R2 (content-hashed). This is mandatory — [10](10-auth-and-security.md)'s
  CSP allows images only from our hosts, and hotlinked externals rot.
- The **review inbox** in the dashboard shows candidates grouped by
  connection: _New_ (approve → item added to draft, stamped with provenance
  `{ provider, connectionId, externalId, fingerprint, importedAt }`),
  _Updated_, _Removed upstream_ (suggest archive — **never auto-delete**),
  each with a field-level diff and inline editing before accept.

### Conflict policy (the three-way merge)

The provenance fingerprint recorded at last accept is the merge base:

| External changed? | User edited since import? | Result                                                                                                                                                                    |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| new item          | —                         | candidate: **New** (review)                                                                                                                                               |
| yes               | no                        | candidate: **Update** — auto-applied to the draft _only if_ the user enabled auto-accept for that connection (per-connection toggle, default **off**); otherwise reviewed |
| yes               | yes                       | **Conflict** — always reviewed, field-level diff, user picks; never overwritten                                                                                           |
| removed           | —                         | candidate: **Archive suggestion** — never auto-applied                                                                                                                    |

So: imported data can overwrite _its own previous import_ when the user has
opted in and hasn't touched the item — and can never, under any setting,
overwrite a user edit. Auto-accepted updates still land in the **draft**;
publish remains the user's act.

### Storage split

| Data                                                                                                                 | Store                                       |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `integration_connections` (provider, authMode, encrypted tokens, input, status, cursor, settings)                    | Postgres                                    |
| `integration_items` (staging: candidates + `raw` JSONB, fingerprint, state: new/updated/conflict/accepted/dismissed) | Postgres                                    |
| `integration_sync_runs` (run log)                                                                                    | Postgres                                    |
| Sync locks, per-provider + per-connection rate budgets, webhook dedupe                                               | Redis (expendable, per [07](07-storage.md)) |
| Rehosted media, uploaded import files (LinkedIn ZIP), oversized raw payloads (pointer from the staging row)          | R2                                          |

### Provider tiers (sets honest expectations)

- **Tier A — API-backed, high value**: GitHub, GitLab, Dev.to, Hashnode,
  Stack Overflow, YouTube, Hugging Face, Figma, Notion, Product Hunt,
  Dribbble. Standard connectors.
- **Tier B — feed/page-based, best-effort**: Medium (RSS), generic RSS,
  CodePen, Kaggle, LeetCode (unofficial GraphQL — fragile; ship behind a
  "beta" label with graceful degradation when it breaks).
- **Tier C — no viable live integration**: LinkedIn (file import),
  Behance (public page at best; defer).

Generic **RSS is a Tier-A-priority connector** despite being Tier B tech:
it subsumes Medium, Substack, personal blogs, and podcast feeds in one
~50-line connector.

## Tradeoffs

- **Review-first costs a click** versus magic auto-sync. That click is the
  product's trust model: users stay editors-in-chief of their professional
  identity, and we never publish something a provider glitch invented. The
  per-connection auto-accept toggle recovers convenience exactly where it's
  safe (untouched items).
- **Polling-first is minutes-to-hours stale.** Correct for this domain — a
  new repo appearing in the inbox next morning is fine; a webhook fleet for
  18 providers is not. GitHub webhooks slot in later without reshaping
  anything.
- **Canonical-kinds-only normalization loses provider richness** at the
  Profile layer by design; `raw` in staging means nothing is destroyed, and
  the `metrics` extension covers the 90% display case. The alternative —
  provider-shaped data in the Profile — breaks every template contract
  eventually.
- **Static connector registry** (code, PR, deploy — like templates) versus
  runtime-pluggable: right call while all connectors are first-party;
  fixtures + typed contract are worth more than hot-loading.
- **Tier B fragility is accepted, labeled, and contained**: a connector
  whose upstream breaks flips to `degraded`, shows it in the UI, and affects
  nothing else.

## Future Scalability

- **New providers**: implement `fetch` + `normalize`, add fixtures,
  register. Public-mode providers are an afternoon; OAuth providers add the
  app registration and scopes ceremony, not architecture.
- **AI enrichment** is a pipeline stage, not a feature bolted on: an
  optional post-normalize **enrich** step (summarize a README into a project
  description, extract skills, rank highlights) that emits _candidates into
  the same review inbox_ — AI proposals obey the same never-silent rule as
  imports. ([01](01-profile-engine.md)'s delta model applies.)
- **Notion as CMS** (blogs/custom pages) reuses connections and the runtime
  but feeds the future content domain, not the Profile — the connector
  emits different resource kinds; the pipeline doesn't change.
- **Enterprise**: org-level connections and admin-approved providers are
  ownership-layer concerns ([06](06-api-architecture.md)'s auth context);
  webhook ingestion and per-tenant rate budgets already have homes.
- **Public API**: connections/candidates expose cleanly as REST resources
  when [06](06-api-architecture.md)'s extraction trigger fires.

## Implementation Strategy

1. **Runtime + one OAuth connector (GitHub)**: connections table, encrypted
   token storage, OAuth routes, Trigger.dev sync task, staging tables,
   fingerprint diffing, media rehosting.
2. **Review inbox** in the dashboard (list, diff, accept/dismiss →
   `domains/profile` apply with provenance).
3. **One public connector (Dev.to or RSS)** — proves the second auth mode
   and the "connector in an afternoon" claim.
4. **Scheduled refresh + conflict states + auto-accept toggle.**
5. **LinkedIn file import** (ZIP parser → same staging pipeline) — proves
   `file` mode and covers the most-requested "provider."
6. Then breadth: one connector at a time, prioritized by user demand, each
   landing with recorded fixtures and normalize tests.

## Open Questions

- Exact canonical `MetricKey` vocabulary (stars, followers, views,
  reputation…) — finalize with the first two connectors. **Seeded (Phase 6
  foundation):** `stars`, `forks`, `followers`, `reactions`, `views`,
  `reputation` (`domains/integrations` `candidate.ts`); GitHub emits
  `stars`/`forks`. Left open — additive per new connector.
- Token encryption key rotation procedure (re-encrypt job vs. lazy
  re-encrypt on read) — decide when the second key version is actually
  needed; the key-version byte keeps both doors open.
- Whether sync-run history is user-visible detail or just a health badge —
  UX call during inbox design.
- LeetCode/Kaggle ToS posture: public-page fetching is gray-zone; legal
  review before those two ship (they're Tier B for a reason).

## Alternatives Considered

- **Embedded integration platforms (Nango, Paragon, Merge.dev)** — they
  solve OAuth plumbing and raw fetching, which is ~20% of this problem; the
  hard 80% (normalization, staging, review, conflict policy, Profile merge)
  stays ours regardless, and we'd pay per-connection forever while coupling
  the product's core promise to a vendor. Worth revisiting only for
  enterprise-tier providers (HRIS-style) where Merge's category is the
  product. Rejected for core.
- **Direct-write sync (no staging/review)** — how most "import your GitHub"
  features work; it either overwrites user edits or accumulates duplicate
  entries, and it violates the non-negotiable principle outright. Rejected.
- **Per-provider bespoke pipelines** (each integration its own tables/jobs/
  UI) — how this starts if there's no contract; N providers become N
  maintenance surfaces. The connector interface exists precisely to prevent
  this. Rejected.
- **Event-sourced sync** (store all provider events, fold into state) —
  powerful for true two-way sync, which we will never do (we never write
  _to_ providers). Massive machinery for a one-way import. Rejected.
- **Storing raw provider payloads in the Profile** ("keep everything, sort
  it out in templates") — pollutes the schema, breaks the ProfileView
  contract, couples templates to providers. Rejected; `raw` stays in
  staging.

## Final Recommendation

One pipeline — **Connect → Fetch → Normalize → Stage → Review → Apply** —
with providers as small connectors (`fetch` + pure `normalize`) behind a
static registry, declaring their auth mode (`oauth2 / token / public /
file`) so public-feed providers stay nearly free to add. The runtime owns
tokens (encrypted, integration-scoped, never near login auth), scheduling
(manual + jittered polling, webhooks later), retries, rate budgets, media
rehosting into R2, and the three-way fingerprint merge whose hard rule is:
imports may update their own untouched imports (opt-in), and may never touch
a user edit. Everything lands in the draft; the user still publishes. The
Profile stays the single source of truth not by policy but by construction —
there is no code path from a provider to the Profile that doesn't pass
through staging and a domain mutation.

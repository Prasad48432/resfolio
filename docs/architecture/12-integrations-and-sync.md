# 12 — Data Imports & Sources

Status: Accepted (revised 2026-07-16: import-first, superseding the original
synchronization-first framing — see "Revision note" at the end)

## Problem Statement

Users should pull their professional content from external platforms (GitHub,
GitLab, Dribbble, Medium, Dev.to, Hashnode, RSS, YouTube, Figma, Notion,
Product Hunt, CodePen, LeetCode, Stack Overflow, Kaggle, Hugging Face, a
LinkedIn data export, …) **into** Resfolio. Providers are **import sources,
nothing more**: once content is imported it becomes ordinary Resfolio data —
the user's data — owned, edited, and published exactly like content they typed
by hand. No provider retains any ongoing claim over an imported item.

The non-negotiable constraint is unchanged: **the Profile remains the single
source of truth.** External data flows through an import → normalization →
routing → review pipeline before it ever touches the Profile, and an import
never silently overwrites user edits — trivially so, because nothing is
applied without an explicit user action.

The design must make adding provider #19 a small, boring task; handle OAuth
and tokens safely; survive flaky third-party APIs, rate limits, and revoked
grants; keep provider-specific junk out of the core Profile schema; and give
content that can't be confidently mapped a home instead of dropping it.

### What this is *not*

This is explicitly **not a synchronization product**. There is no live
mirroring, no scheduled auto-applied updates, no conflict-resolution workflow,
no upstream-deletion tracking. Users don't want their profile to be a mirror
of GitHub; they want a great first import, and — for providers where it's
cheap — an optional, user-initiated "check for updates." Freshness machinery
is a per-provider enhancement (see "Optional refresh"), not the architecture's
spine.

### Assumptions challenged first

- **LinkedIn: live sync is not possible.** The API is partner-gated
  (Sign-In/marketing scopes only; no profile-read for apps like ours) and
  scraping violates ToS and gets accounts flagged. The honest product answer
  is a **file import**: LinkedIn's official data export ZIP (Settings → Get a
  copy of your data) parses cleanly into positions, education, skills, and
  certifications. One-time import, clearly labeled — and under the import
  model this is not a degraded fallback, it's the flagship multi-section
  import.
- **Behance is effectively closed too** — Adobe stopped issuing API keys
  years ago. Treat it as a public-page (Tier C) provider or defer; don't
  promise it.
- **"Integration" ≠ "OAuth."** Most of this list needs no credentials at
  all: Medium is an RSS feed, Dev.to and Stack Overflow have public APIs
  keyed by username, Hashnode has a public GraphQL API, Hugging Face and
  Kaggle have public profiles, YouTube channels have public feeds. The
  connector contract below makes **auth mode a per-provider declaration**,
  which is the single biggest lever for "adding a provider is simple."
- **Not everything maps cleanly.** Some provider content has no obvious
  Profile section. A synchronization architecture silently drops it; an
  import architecture gives it an explicit escape hatch (`unclassified`) and
  keeps it in the workspace until the user routes it.

## Proposed Architecture

### The pipeline (one shape for every provider)

```
CONNECT           FETCH             NORMALIZE          ROUTE                STAGE               REVIEW               IMPORT
grant/username → connector pulls → connector maps  →  routing policy   →  candidate items  →  user routes, edits, →  domain merge into
or file upload    raw items         raw → canonical    assigns each a      (Postgres staging,   imports, or skips      Profile DRAFT with
                                    CandidateItem      destination (or     deduped by            (import workspace)     provenance stamped
                                                       "unrouted")         fingerprint)
```

Nothing reaches the Profile except through **Import**, which is an ordinary
`domains/profile` mutation on the _draft_ (so even imported items still go
through the user's publish step, per [01-profile-engine](01-profile-engine.md)).

**Routing is a named stage with its own policy**, not a lookup buried in
apply. Every candidate carries
`route: { sectionKey | "basics" | null, confidence: "certain" | "suggested" }`:

- **Defaulted by kind** — an `article` routes to Writing, an `experience` to
  Experience, with `certain` confidence.
- **Overridable by the connector** — e.g. GitHub's bio → `basics.summary` is
  `suggested`, never applied without the user seeing where it's going.
- **Overridable by the user at import time** — `importItem(..., { routeTo })`
  lets the user redirect an item to any compatible section. Apply validates
  payload ↔ section compatibility, so a mis-route can never produce an
  invalid profile.
- **`route: null` = unrouted** — the item stays in the Sources workspace
  ("needs a home") until the user routes or dismisses it. Nothing is silently
  dropped.

### The connector contract — `@resfolio/integrations`

All import logic lives in `domains/integrations`. Each provider is a small
module implementing one interface, registered in a static registry (same
pattern as templates, [05-template-sdk](05-template-sdk.md)):

```ts
export const github = defineConnector({
  id: "github",
  name: "GitHub",
  authMode: "oauth2",              // "oauth2" | "token" | "public" | "file"
  auth: { scopes: ["read:user", "public_repo"] },        // oauth2 only
  input: undefined,                 // "public": z.object({ username }) ; "file": accepted formats
  resources: ["project", "contribution"],   // what canonical kinds it emits
  capabilities: { refreshable: true, incremental: true },
  // refreshable: may offer "Check for updates" (file imports declare false);
  // incremental: supports cursor/ETag fetch (else the runtime full-refetches)

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
- Everything else — token handling, retries, staging, dedupe, routing
  defaults, media rehosting, the import workspace UI — is the **runtime**,
  written once. A public-feed connector is realistically ~100 lines.
- `capabilities.refreshable` declares whether the provider supports "Check
  for updates" at all. One-shot providers (file imports) declare `false` and
  skip every piece of refresh machinery by construction.

**CandidateItem** is the canonical staging shape: a proposed Profile item
plus `{ externalId, url, fingerprint, route, media[], raw }`. Canonical kinds
cover the whole Profile:

```
project | contribution | article | talk | profileBasics
| experience | education | skillGroup | certification     ← multi-section providers (LinkedIn)
| unclassified                                            ← the escape hatch
```

Typed kinds reuse the profile item schemas verbatim. `unclassified` is a
loose payload (`title`, `text`, `url`, `date`) for content a connector can't
confidently type — it has **no automatic destination** and waits in the
workspace for user routing (to a custom section, or to a typed section via a
small field-mapping step).

### Import semantics (replaces the conflict model)

The staged row's job changes at the moment of import. **Before** import it is
a pending candidate. **After** import it is an **import receipt**: provenance
(`{ provider, connectionId, externalId, fingerprint, importedAt }`) plus the
dedupe key. The receipt exists for exactly two purposes:

1. **Idempotent re-imports** — re-fetching (or re-uploading the same file)
   upserts on `(connectionId, externalId)`; an unchanged fingerprint is a
   `duplicate` and is silently skipped. Users can never accumulate duplicate
   entries by importing twice.
2. **Optional re-import suggestions** — for `refreshable` providers, a
   user-initiated "Check for updates" may find a changed fingerprint and mark
   the receipt `refresh_available`: a badge and a re-import button, nothing
   more. If the user has edited their copy since import (`userEdited`, from
   the applied-fingerprint check), the re-import button carries a warning —
   "this will replace your edited copy" — and requires the click anyway.

Classification is therefore three states, all import-shaped:

| Upstream vs. receipts            | State               | What happens                                                       |
| -------------------------------- | ------------------- | ------------------------------------------------------------------ |
| new `externalId`                 | `new`               | candidate appears in the workspace for triage                      |
| same fingerprint as receipt      | `duplicate`         | silently skipped — idempotence                                     |
| changed fingerprint vs. receipt  | `refresh_available` | badge + re-import button; warns if the user edited their copy      |

**There is no conflict state and no archive suggestion.** Upstream deletion
produces nothing: the user's imported item does not care that a repo was
deleted — it's their content now. The never-overwrite invariant survives at
full strength, but it stops being a merge policy and becomes a structural
property: **nothing is ever applied without a user click**, and the only
overwrite path (re-import over an edited copy) is explicit, warned, and
user-initiated.

Dismissals are sticky: a dismissed candidate stays dismissed until its
upstream content actually changes.

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
  presigned R2 → parse → same staging pipeline. One-shot by declaration
  (`refreshable: false`); no connection to keep alive.

Tokens (access + refresh) are **encrypted at rest** (AES-256-GCM,
per-column, key from validated env with a key-version byte for rotation),
stored in `integration_connections`, decrypted only inside the connector
runtime. Never logged (Pino redaction, [11](11-engineering-foundation.md)),
never sent to the client, never in Redis. A failed refresh or revoked grant
flips the connection to `needs_reauth` and surfaces it — it never retries
into a lockout.

### Fetch discipline

Imports run on user action: connecting runs the first import inline;
"Import again" / "Check for updates" re-runs it. Rate limiting is two-level
in Redis: a **per-provider app budget** (e.g. GitHub's 5k/hr across all
users) and per-connection courtesy limits; the runtime's `fetch` blocks on
both, so connectors can't misbehave. Manual runs are rate-limited per
connection.

**Retries and failure classification** (runtime-owned): `401/403` →
`needs_reauth`, stop; `429` → respect `Retry-After`, backoff; `5xx`/network
→ backoff; normalize errors → capture to Sentry with the raw item, skip the
item, never fail the run. Every run writes an `integration_sync_runs` row
(status, counts, duration, error) — the import history and the support
surface.

### Normalization, provenance, and the import workspace

- Connectors map to **canonical kinds only**. Provider-specific richness is
  preserved in the staging row's `raw` JSONB — never in the Profile. The
  canonical item schema gets exactly one narrow, typed extension point:
  `metrics?: { key: MetricKey, value: number }[]` (stars, followers,
  reputation…) so templates can show "★ 2.3k" without knowing providers.
  If a provider field earns first-class status, that's a deliberate profile
  schema version bump ([01](01-profile-engine.md)) — not connector creep.
  `unclassified` is the pressure valve that keeps this rule from silently
  dropping data.
- **Media is rehosted**: covers/screenshots/avatars are downloaded at stage
  time into R2 (content-hashed). This is mandatory — [10](10-auth-and-security.md)'s
  CSP allows images only from our hosts, and hotlinked externals rot.
- **Provenance is stamped on import** (`source`, `sourceId` on the profile
  item; the receipt row holds the rest) and retained **only** for
  deduplication and re-import suggestions. It confers no ongoing provider
  ownership: the imported item is ordinary profile content — fully editable,
  never touched by any later run, and it survives disconnecting or deleting
  the source.

The dashboard's **Sources page is an import workspace**, not an integration
manager:

- **"Import from…"** — a provider gallery (GitHub, RSS, LinkedIn export
  upload; more greyed by tier) is the primary surface. Connecting runs the
  first import immediately.
- **Triage view** — fetched candidates grouped by destination
  ("12 → Projects · 3 → Writing · 2 need a home"), with per-group
  **Import all**, per-item destination override (a Select of compatible
  sections), inline **edit-before-import**, and **Skip**.
- **"Needs a home"** — the unrouted/`unclassified` bucket, persistent until
  the user routes or dismisses each item.
- **History, not health** — an "Imported" list of receipts (what, from
  where, when, → link to the item in `/profile`), plus a quiet **Check for
  updates** per refreshable source that can surface "3 items have newer
  versions — re-import?".
- **Connected sources** — a small management row (remove / re-auth):
  plumbing, not the page's identity.

### Provider mapping declarations

Each connector owns a declared mapping table (in code and in its docs), all
landing on canonical kinds:

| Provider                     | Mapping                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                       | repos → `project` (topics → technologies, stars/forks → metrics); bio → `profileBasics` (suggested, never auto); extras stay in `raw`     |
| RSS / Medium / Dev.to / Hashnode | entries → `article` → Writing                                                                                                        |
| LinkedIn export (file)       | positions → `experience`, education → `education`, skills → `skillGroup`, certifications → `certification` — the multi-section proof      |
| Stack Overflow               | tags → `skillGroup` (suggested), reputation/badges → metrics on `profileBasics`; anything odd → `unclassified`                            |
| Dribbble / Behance / Figma   | shots/files → `project` (images pending R2 rehosting)                                                                                     |

A connector for a provider with awkward data can ship emitting `unclassified`
on day one (still useful — content lands in the workspace) and gain typed
mappings incrementally.

### Storage split

| Data                                                                                                                          | Store                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `integration_connections` (provider, authMode, encrypted tokens, input, status, cursor)                                        | Postgres                                    |
| `integration_items` (staging + receipts: candidate/`raw` JSONB, fingerprint, route, state: new/imported/refresh_available/dismissed) | Postgres                              |
| `integration_sync_runs` (import-run log)                                                                                        | Postgres                                    |
| Import locks, per-provider + per-connection rate budgets                                                                         | Redis (expendable, per [07](07-storage.md)) |
| Rehosted media, uploaded import files (LinkedIn ZIP), oversized raw payloads (pointer from the staging row)                      | R2                                          |

### Provider tiers (sets honest expectations)

- **Tier A — API-backed, high value**: GitHub, GitLab, Dev.to, Hashnode,
  Stack Overflow, YouTube, Hugging Face, Figma, Notion, Product Hunt,
  Dribbble. Standard connectors.
- **Tier B — feed/page-based, best-effort**: Medium (RSS), generic RSS,
  CodePen, Kaggle, LeetCode (unofficial GraphQL — fragile; ship behind a
  "beta" label with graceful degradation when it breaks).
- **Tier C — no viable API**: LinkedIn (file import — under the import
  model, a first-class citizen), Behance (public page at best; defer).

Generic **RSS is a Tier-A-priority connector** despite being Tier B tech:
it subsumes Medium, Substack, personal blogs, and podcast feeds in one
~50-line connector.

### Optional refresh (future, per-provider)

Everything in this section is an enhancement, never the spine:

- **"Check for updates"** — user-initiated re-fetch for `refreshable`
  providers, producing `refresh_available` badges. This is the only refresh
  surface in V1.
- **Scheduled refresh** (Trigger.dev, jittered cadence) — later, and only to
  keep the badges fresh; it never applies anything. Not on the critical path.
- **Webhooks** (GitHub push/repo events) — a further optimization of badge
  freshness; webhook receipt enqueues the same import run. Later, if ever.
- **Auto-accept** — rejected as a product surface. The
  `integration_connections.auto_accept` column stays dormant in the schema
  (cheap) but is not exposed by the domain or UI.

## Tradeoffs

- **Import-first costs freshness** versus a sync product: no automatic
  updates, no upstream-deletion tracking, no auto-accept convenience. These
  are deliberate non-goals — they belong to a mirroring product, and this
  isn't one. Honest copy ("Import from GitHub", "Check for updates") sets
  the expectation; Trigger.dev drops off the critical path entirely.
- **Import-first buys a simpler mental model** — content is either "in my
  profile" (mine, ordinary) or "in the workspace" (pending my decision) —
  plus a home for unmappable data, multi-section providers, and materially
  less runtime surface to maintain.
- **Review-first costs a click** versus magic auto-sync. That click is the
  product's trust model: users stay editors-in-chief of their professional
  identity, and we never publish something a provider glitch invented.
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

- **New providers**: input schema + `fetch` + `normalize` + fixtures + a
  mapping declaration, then register. Public-mode providers are an
  afternoon; OAuth providers add the app registration and scopes ceremony,
  not architecture. Awkward providers ship `unclassified`-first.
- **AI enrichment** is a pipeline stage, not a feature bolted on: an
  optional post-normalize **enrich** step (summarize a README into a project
  description, extract skills, rank highlights) that emits _candidates into
  the same workspace_ — AI proposals obey the same nothing-without-a-click
  rule as imports. ([01](01-profile-engine.md)'s delta model applies.)
- **Notion as CMS** (blogs/custom pages) reuses connections and the runtime
  but feeds the future content domain, not the Profile — the connector
  emits different resource kinds; the pipeline doesn't change.
- **Enterprise**: org-level connections and admin-approved providers are
  ownership-layer concerns ([06](06-api-architecture.md)'s auth context).
- **Public API**: connections/candidates expose cleanly as REST resources
  when [06](06-api-architecture.md)'s extraction trigger fires.

## Implementation Strategy

1. **6R-1 — Architecture**: this document + the pure layer (expanded
   candidate kinds, routing metadata, import-semantics classify) with tests.
   Locks the model.
2. **6R-2 — Runtime**: additive migration (`route_section_key`,
   `route_confidence`, state migration), `runImport`,
   `importItem(itemId, { routeTo?, edits? })`, duplicate-skip. Re-run the
   live RSS end-to-end proof under import semantics.
3. **6R-3 — Import workspace UI**: provider gallery, triage-by-destination,
   needs-a-home bucket, history. RSS + GitHub-fixture flows fully local.
4. **6R-4 — LinkedIn file import**: the multi-section routing proof
   (ZIP → experience/education/skills/certifications), no accounts needed.
5. **6R-5 — Breadth + optional refresh**: Dev.to/Stack Overflow connectors;
   "Check for updates" for refreshable providers. GitHub OAuth and R2 media
   rehosting remain account-gated.

## Open Questions

- Exact canonical `MetricKey` vocabulary (stars, followers, views,
  reputation…). **Seeded (Phase 6 foundation):** `stars`, `forks`,
  `followers`, `reactions`, `views`, `reputation` (`domains/integrations`
  `candidate.ts`); GitHub emits `stars`/`forks`. Left open — additive per
  new connector.
- The `unclassified` → typed-section field-mapping step: how small can the
  mapping UI be before it's just "edit the item"? Decide during 6R-3.
- Token encryption key rotation procedure (re-encrypt job vs. lazy
  re-encrypt on read) — decide when the second key version is actually
  needed; the key-version byte keeps both doors open.
- LeetCode/Kaggle ToS posture: public-page fetching is gray-zone; legal
  review before those two ship (they're Tier B for a reason).

## Alternatives Considered

- **Synchronization-first (the original version of this document)** — a
  three-way merge with conflict states, archive suggestions on upstream
  deletion, per-connection auto-accept, and scheduled refresh as the spine.
  Technically sound, but it makes providers co-owners of imported content
  and makes the user a conflict resolver. The product vision is
  import-first: providers are data sources, imported content is the user's.
  Superseded by this revision; the surviving machinery (fingerprints,
  provenance, staging, review) is identical — only the post-import
  relationship inverted.
- **Embedded integration platforms (Nango, Paragon, Merge.dev)** — they
  solve OAuth plumbing and raw fetching, which is ~20% of this problem; the
  hard 80% (normalization, routing, staging, review, Profile merge) stays
  ours regardless, and we'd pay per-connection forever while coupling the
  product's core promise to a vendor. Rejected for core.
- **Direct-write import (no staging/review)** — how most "import your
  GitHub" features work; it either overwrites user edits or accumulates
  duplicate entries. Rejected.
- **Per-provider bespoke pipelines** (each integration its own tables/jobs/
  UI) — N providers become N maintenance surfaces. The connector interface
  exists precisely to prevent this. Rejected.
- **Event-sourced sync** (store all provider events, fold into state) —
  powerful for true two-way sync, which we will never do (we never write
  _to_ providers). Massive machinery for a one-way import. Rejected.
- **Storing raw provider payloads in the Profile** ("keep everything, sort
  it out in templates") — pollutes the schema, breaks the ProfileView
  contract, couples templates to providers. Rejected; `raw` stays in
  staging.

## Final Recommendation

One pipeline — **Connect → Fetch → Normalize → Route → Stage → Review →
Import** — with providers as small connectors (`fetch` + pure `normalize`)
behind a static registry, declaring their auth mode (`oauth2 / token /
public / file`) and whether they're `refreshable`. Routing is an explicit
stage with a per-kind default, connector suggestions, a user override at
import time, and `unclassified`/unrouted as the escape hatch that guarantees
no data is silently dropped. The runtime owns tokens (encrypted,
integration-scoped, never near login auth), retries, rate budgets, media
rehosting into R2, and fingerprint-based dedupe.

Imported content is **ordinary Resfolio data**: providers are import
sources with no ongoing ownership; provenance survives only as a dedupe key
and an optional "newer version available — re-import?" suggestion, and the
only path that can ever replace a user's edit is an explicit, warned,
user-initiated re-import. Everything lands in the draft; the user still
publishes. The Profile stays the single source of truth not by policy but
by construction — there is no code path from a provider to the Profile that
doesn't pass through staging and a user's click.

---

_Revision note (2026-07-16): this document originally described a
synchronization-first architecture ("Data Integrations & Synchronization"):
scheduled refresh as the spine, a three-way conflict merge
(new/updated/conflict/archive), per-connection auto-accept, and
upstream-deletion tracking. The product vision is import-first; the
document was rewritten in place. The connector contract, auth modes, token
crypto, staging tables, fingerprints, and apply-through-draft all survive
unchanged — the post-import relationship inverted (receipts, not links) and
routing was promoted to a named stage._

# @resfolio/integrations — the imports domain

The Career-OS differentiator (docs/architecture/12-integrations-and-sync.md,
revised 2026-07-16 to **import-first**): pull professional content from
external sources into Resfolio through one pipeline — **Connect → Fetch →
Normalize → Route → Stage → Review → Import**. Providers are **import
sources, nothing more**: imported content becomes ordinary Resfolio data, and
no provider retains ongoing ownership over an imported item. The
non-negotiable constraint: the **Profile stays the single source of truth** —
external data never reaches the Profile except through the Sources workspace
and an ordinary `@resfolio/profile` **draft** mutation behind an explicit
user click. There is no conflict state, no archive suggestion, no
auto-accept: re-fetching at most produces a `refresh_available` badge, and
the only path that can replace a user edit is a warned, user-initiated
re-import. Mirrors the layering of `@resfolio/profile` and
`@resfolio/portfolio`.

## Layering

- **Root (`.`, pure):** framework- and database-free. Safe to import into the
  dashboard, the runtime, and tests alike. Everything below is here.
  - **`contract.ts`** — `defineConnector` + the `Connector` interface. Each
    provider implements exactly two functions: `fetch(ctx)` (the only place a
    provider API is touched, an `AsyncIterable<Raw>`) and `normalize(raw)`
    (**pure**: raw → `CandidateItem[]`). Metadata declares the `authMode`
    (`oauth2 | token | public | file`) — **the load-bearing per-provider
    declaration** that keeps public-feed connectors nearly free — and
    `capabilities: { refreshable, incremental }`: `refreshable: false` lets
    one-shot providers (file imports) skip all refresh machinery by
    declaration. `FetchContext` is the runtime seam: a **pre-authenticated,
    rate-limited** `fetch` (tokens injected as headers by the runtime, never
    handled by connector code), the validated `input`, and the incremental
    `cursor`/`setCursor`. `defineConnector` validates + freezes at module
    load (throws `ConnectorDefinitionError`) — loud in CI, never mid-run.
  - **`candidate.ts`** — `candidateItemSchema`, the canonical staging shape.
    Kinds cover the whole Profile: `project | contribution | article | talk |
experience | education | skillGroup | certification | profileBasics`
    plus **`unclassified`** — the escape hatch (loose `title/text/url/date`
    payload, no automatic destination) that keeps canonical-kinds-only from
    silently dropping data. Typed payloads **reuse the profile item schemas**
    minus provenance — Import stamps a fresh `createItemId()` → `id`, the
    provider → `source`, `externalId` → `sourceId`. Candidates may carry a
    connector `route` override; provider richness lives in `raw` (staging
    only, never the Profile); the one typed Profile-facing extension is
    `metrics` (`MetricKey`: stars/forks/followers/…).
  - **`routing.ts`** — the Route stage's policy: `DEFAULT_ROUTE_FOR_KIND`
    (per-kind default; `profileBasics` is `suggested`, `unclassified` is
    unrouted), `COMPATIBLE_ROUTE_TARGETS` (what a user override may pick —
    validated so a mis-route can't produce an invalid profile),
    `resolveRoute` (connector declaration sanitized: incompatible → unrouted,
    never guessed), `assertRouteTarget`. Routes are
    `{ sectionKey: SectionKey | "basics" | null, confidence: "certain" |
"suggested" }`; `null` = "needs a home", waits for the user.
  - **`fingerprint.ts`** — `computeFingerprint`, a deterministic,
    dependency-free content hash (FNV-1a, no `node:crypto`) over the content
    that would land in the Profile — **never `raw`**, so provider churn can't
    fake an update. Its job is idempotent re-import/dedupe.
  - **`classify.ts`** — `classifyCandidate`, the pure import classification:
    `new | duplicate | refresh_available` against the fingerprint recorded at
    last import. `duplicate` is the idempotence rule (importing twice can
    never create a second copy); `refresh_available` is only ever a badge.
    The never-overwrite invariant is **structural** — nothing auto-applies.
  - **`registry.ts`** — the static connector registry (code + PR + deploy,
    like templates): `CONNECTORS`, `getConnector`, `listConnectors`.
  - **`connectors/`** — the **V1 set, all `public`**: `github`
    (`{username}` → `project`), `rss` (`{feedUrl}` → `article`), `devto`
    (`{username}` → `article`), `stackoverflow` (`{userId}` → `skillGroup`
    and `profileBasics`). Each is `fetch` + pure `normalize` + recorded
    fixtures + a declared mapping (doc 12's provider table).
    **No connector stores a credential**, which is why
    `INTEGRATIONS_TOKEN_KEY` is optional and currently unused.
    GitHub is `public`, not `oauth2`: `GET /users/{username}/repos` answers
    everything a project needs, and the scopes only bought private repos —
    content nobody puts on a public profile. It imports **only** name,
    description, `repoUrl`, stars, forks, language and topics; `created_at`
    and the owner avatar were deliberately dropped (doc 12 §5 — the test is
    "would a user have typed this?", not "is it in the payload?").
    **Adding a fifth provider is a deliberate decision, not a backlog item**
    (doc 12, V1 provider set). LinkedIn's file import was built and removed;
    `ITEM_SOURCES` still carries `"linkedin"` because that enum is
    additive-only.
  - **`apply.ts`** — the pure half of Import: `buildProfileItem` (candidate →
    canonical item, provenance stamped; converts `unclassified` → custom-item
    content), `buildBasicsPatch`, `sectionForKind`, and the re-import
    warning's primitives — `contentFingerprint(kind, payload)` recorded at
    import, `extractAppliedPayload(profile, kind, itemId)` re-extracted
    later, and `detectUserEdit` (a removed item counts as edited).
- **`./server` (DB):** the import runtime — the only code that touches
  `integration_connections` / `integration_items` / `integration_sync_runs`
  (migrations `0005` + `0006`). Owner-scoped (every function takes `userId`,
  scoped through the profile, like every other domain repository).
  - **`crypto.ts`** — AES-256-GCM token encryption, pure over an explicit
    key-versioned `TokenKeyring` (envelope `v<n>.<iv>.<tag>.<ct>`, rotation-
    ready); the key comes from the optional `INTEGRATIONS_TOKEN_KEY` env slice
    (`public`/`file` connectors need no key). Decryption happens **only**
    inside the import runtime; no exported record carries token material.
  - **`import-run.ts`** — `runImport`: builds the `FetchContext` (token-
    injecting, per-run-budgeted fetch that also spots 401/403 →
    `needs_reauth`). Two token sources, and the difference is load-bearing:
    a **connection** token is the user's own grant, so a 401/403 against it
    means the grant is gone and only they can fix it → `needs_reauth`. A
    **server** token (`serverTokenFor()` in `server/env.ts` — today
    `GITHUB_TOKEN`) is a platform-wide _rate-limit lever_ nobody granted, so a
    403 there is the provider throttling us; reporting that as a broken
    connection would be a lie the user can't act on. **Only a connection token
    may raise the auth alarm.** `serverTokenFor` is an explicit map rather than
    an env name declared on the connector: `@resfolio/env` is the only
    sanctioned reader of `process.env` (doc 11), so a `process.env[name]`
    lookup would break that rule _and_ leak an env var name into the pure
    root — and a connector should not know the token exists anyway
    (`FetchContext` already promises a pre-authenticated fetch).
    It then drives `fetch` → `normalize`, resolves each candidate's
    route, upserts staging rows on `(connectionId, externalId)`, classifies
    against the stored `baseFingerprint` (duplicate → silently skipped;
    dismissals stick until content changes), and after full refetches prunes
    never-imported rows whose upstream content disappeared — **receipts are
    untouched: upstream deletion produces nothing**. Always writes a run row;
    failure flips the connection to `needs_reauth`/`degraded`, never throws
    at the caller. Runs on user action (connect runs the first import inline;
    "Check for updates" re-runs it).
  - **`import.ts`** — `importItem(userId, itemId, { routeTo?,
customSectionTitle?, edits? })`: an **ordinary `@resfolio/profile` draft
    mutation** via the pure edit helpers. Route = user override → staged
    route (unrouted without an override is refused; every target validated).
    Custom-routed items land in a titled custom section (`talk` → "Talks",
    `unclassified` → "Imported", overridable). Inline `edits` re-validate
    through the candidate schema; optimistic-concurrency retry on
    `StaleDraftError`; then the staged row becomes a **receipt**
    (`baseFingerprint` + `appliedFingerprint` + `appliedItemId`). A re-import
    refreshes the applied item in place — including over a user edit, because
    the user clicked through the warning the UI derives from `userEdited`.
  - **`repository.ts`** — connection CRUD (validated public input, coarse
    production-only SSRF guard, public-input dedupe), `listPendingItems`
    (state `new` — the triage query), `listImportReceipts` (rows imported at
    least once, with `userEdited` computed against the live draft for
    `refresh_available` rows), `dismissItem` (sticky until upstream content
    changes), `routeItem` (give a pending item a destination without
    importing), `listImportRuns`. `auto_accept` exists as a column but is
    **dormant** — the domain never reads it.
  - Trigger.dev (only ever for refresh badges), Redis rate budgets, and R2
    media rehosting are account-gated and later. **GitHub OAuth routes are not
    on this list any more** — they were never needed (see `connectors/`).

## Rules

- **`normalize` is pure and exhaustively tested** against recorded raw fixtures
  (doc 11 fixture discipline). `fetch` uses **only** `ctx.fetch` — never global
  `fetch` — so token injection + rate budgets are enforced centrally and can't
  be bypassed.
- **Canonical kinds only.** A connector maps to the profile's canonical item
  shapes; it never invents Profile fields. A new provider field earning
  first-class status is a deliberate profile schema bump (doc 01), not
  connector creep. `unclassified` is the pressure valve — a connector with
  awkward data ships emitting it on day one and gains typed mappings
  incrementally. New `CANDIDATE_KINDS` gain a payload variant + a routing
  entry (`DEFAULT_ROUTE_FOR_KIND` + `COMPATIBLE_ROUTE_TARGETS`) together.
- **Auth mode is a declaration, not a code path.** Adding a `public` connector
  is ~an afternoon (an `input` schema + `fetch` + `normalize`); an `oauth2` one
  adds only the app-registration/scopes ceremony, not architecture.
- **Media URLs on candidates are the provider's originals** — the runtime
  rehosts them into R2 at stage time (doc 10 CSP: images only from our hosts).

## Tests

Co-located vitest, exhaustive: `defineConnector` accept/reject, candidate schema
(payload reuse across all kinds, unsafe-scheme rejection, route field,
per-kind discrimination), routing policy (defaults, compatibility, the
sanitize-to-unrouted rule), fingerprint (determinism, `raw`-insensitivity,
change detection), classify (the three-row import table + idempotence/totality
fuzzing), each connector's `fetch` (against a fake in-memory `ctx` — no
network) + `normalize` (recorded fixtures), the pure apply mapping (provenance
stamping, multi-section kinds, the unclassified → custom conversion, the
`detectUserEdit` round-trip that is false right after an import and true after
an edit or deletion), and the token crypto (round-trip, per-encryption IV, GCM
tamper rejection, key rotation). The DB runtime carries no co-located DB
tests — it is exercised end-to-end via a local RSS feed against the dev
database (last run 2026-07-16, under import semantics: routed staging →
import with provenance → duplicate-skip idempotence → refresh badge with the
draft untouched → user-edit warning → explicit warned re-import → upstream
deletion produces nothing → unrouted refusal → route-to-custom).

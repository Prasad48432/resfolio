# @resfolio/integrations — the integrations domain

The Career-OS differentiator (docs/architecture/12-integrations-and-sync.md):
connect external platforms and pull professional content into Resfolio through
one pipeline — **Connect → Fetch → Normalize → Stage → Review → Apply**. The
non-negotiable constraint: the **Profile stays the single source of truth** —
external data never reaches the Profile except through the review inbox and an
ordinary `@resfolio/profile` **draft** mutation, and imported data never
silently overwrites a user edit. Mirrors the layering of `@resfolio/profile`
and `@resfolio/portfolio`.

## Layering

- **Root (`.`, pure):** framework- and database-free. Safe to import into the
  dashboard, the (future) runtime, and tests alike. Everything below is here.
  - **`contract.ts`** — `defineConnector` + the `Connector` interface. Each
    provider implements exactly two functions: `fetch(ctx)` (the only place a
    provider API is touched, an `AsyncIterable<Raw>`) and `normalize(raw)`
    (**pure**: raw → `CandidateItem[]`). Metadata declares the `authMode`
    (`oauth2 | token | public | file`) — **the load-bearing per-provider
    declaration** that keeps public-feed connectors nearly free. `FetchContext`
    is the runtime seam: a **pre-authenticated, rate-limited** `fetch` (tokens
    injected as headers by the runtime, never handled by connector code), the
    validated `input`, and the incremental `cursor`/`setCursor`. `defineConnector`
    validates + freezes at module load (throws `ConnectorDefinitionError`) —
    loud in CI, never mid-sync. Same enforcement point as the SDK's `defineTemplate`.
  - **`candidate.ts`** — `candidateItemSchema`, the canonical staging shape. Its
    `payload` **reuses the profile item schemas** (`projectItemSchema`,
    `writingItemSchema`, …) minus provenance — Apply stamps a fresh
    `createItemId()` → `id`, the provider → `source`, `externalId` → `sourceId`
    (the profile schema already reserved `sourceId` for this). Provider richness
    lives in `raw` (staging only, never the Profile); the one typed Profile-
    facing extension is `metrics` (`MetricKey`: stars/forks/followers/…).
  - **`fingerprint.ts`** — `computeFingerprint`, a deterministic, dependency-free
    content hash (FNV-1a, no `node:crypto`) over the content that would land in
    the Profile — **never `raw`**, so provider churn can't fake an update. The
    merge base for conflict detection.
  - **`classify.ts`** — `classifyCandidate`, the pure three-way merge decision
    (new / updated / conflict / unchanged / archive). **The phase's hard rule
    lives here:** a user-edited item is never classified `updated` (the only
    auto-appliable state) — imports may refresh their own untouched import,
    never a user edit.
  - **`registry.ts`** — the static connector registry (code + PR + deploy, like
    templates): `CONNECTORS`, `getConnector`, `listConnectors`.
  - **`connectors/`** — `github` (`oauth2`, emits `project`) and `rss` (`public`,
    emits `article`). Each is `fetch` + pure `normalize` + recorded fixtures.
- **`./server` (deferred — next increment):** the DB runtime — the
  `integration_connections` / `integration_items` / `integration_sync_runs`
  tables, encrypted token storage (AES-256-GCM), the staging upsert on
  `(connectionId, externalId)`, and **apply-to-draft** (a candidate →
  `@resfolio/profile` edit helper with provenance). Scheduled sync (Trigger.dev),
  OAuth routes, and R2 media rehosting are account-gated and land after.

## Rules

- **`normalize` is pure and exhaustively tested** against recorded raw fixtures
  (doc 11 fixture discipline). `fetch` uses **only** `ctx.fetch` — never global
  `fetch` — so token injection + rate budgets are enforced centrally and can't
  be bypassed.
- **Canonical kinds only.** A connector maps to the profile's canonical item
  shapes; it never invents Profile fields. A new provider field earning
  first-class status is a deliberate profile schema bump (doc 01), not connector
  creep. New `CANDIDATE_KINDS` gain a payload variant + a profile mapping together.
- **Auth mode is a declaration, not a code path.** Adding a `public` connector
  is ~an afternoon (an `input` schema + `fetch` + `normalize`); an `oauth2` one
  adds only the app-registration/scopes ceremony, not architecture.
- **Media URLs on candidates are the provider's originals** — the runtime
  rehosts them into R2 at stage time (doc 10 CSP: images only from our hosts).

## Tests

Co-located vitest, exhaustive: `defineConnector` accept/reject, candidate schema
(payload reuse, unsafe-scheme rejection, per-kind discrimination), fingerprint
(determinism, `raw`-insensitivity, change detection), classify (every merge-table
row + the never-overwrite invariant, fuzzed), and each connector's `fetch`
(against a fake in-memory `ctx` — no network) + `normalize` (recorded fixtures).

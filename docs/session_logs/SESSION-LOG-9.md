# Session Log 9 — Phase 6 (session 1): the integrations pure foundation

Date: 2026-07-16 · Previous log: [SESSION-LOG-8.md](SESSION-LOG-8.md)

Phase 5 (portfolio) is product-complete. **Phase 6 (Integrations V1, doc 12)
begins.** It's the biggest phase yet and several pieces are inherently
account-gated (GitHub OAuth app, Trigger.dev scheduling, R2 media rehosting) —
so, following the pattern every prior domain used (`profile`, `document`,
`portfolio` all shipped a pure, framework-free root first, then the DB
`./server`), this session built the **pure `@resfolio/integrations`
foundation**: the connector contract, the canonical staging shape, the
fingerprint + three-way merge, the registry, and the first two connectors —
all unit-tested with no DB, no network, no accounts. This locks the contract
every downstream piece depends on.

---

## 1. `@resfolio/integrations` — pure root (doc 12)

New `domains/integrations` package (mirrors the `domains/portfolio` skeleton;
`base` tsconfig — no JSX; deps `@resfolio/profile` + `zod` + `fast-xml-parser`).

- **`contract.ts`** — `defineConnector` + the `Connector` interface. A provider
  implements exactly two functions: `fetch(ctx): AsyncIterable<Raw>` (the only
  place a provider API is touched) and `normalize(raw): CandidateItem[]`
  (**pure**). Metadata declares the `authMode` (`oauth2 | token | public |
file`) — the load-bearing per-provider lever. **`FetchContext` is the runtime
  seam**, defined now so the runtime needs no contract change: a
  pre-authenticated + rate-limited `fetch` (tokens injected by the runtime,
  never handled by connector code), the validated `input`, and the incremental
  `cursor`/`setCursor`. `defineConnector` validates + freezes at load (throws
  `ConnectorDefinitionError`) — the same loud-in-CI enforcement point as the
  SDK's `defineTemplate`.
- **`candidate.ts`** — `candidateItemSchema`, a discriminated union on `kind`
  (`project | contribution | article | talk | profileBasics`). Its `payload`
  **reuses the profile item schemas verbatim** (`projectItemSchema`,
  `writingItemSchema`, `customItemSchema`, `basicsSchema`) minus provenance —
  the profile schema had already reserved `sourceId` "for the connector to
  upsert by, Phase 6" and `ITEM_SOURCES` already lists `github`/`rss`, so Apply
  is a clean stamp (`externalId → sourceId`, provider → `source`, fresh
  `createItemId() → id`). Provider richness stays in `raw` (staging only); the
  one typed Profile-facing extension is `metrics` (`MetricKey` seeded:
  stars/forks/followers/reactions/views/reputation).
- **`fingerprint.ts`** — `computeFingerprint`: a deterministic, dependency-free
  content hash (FNV-1a two-seed → 16 hex chars, no `node:crypto`) over the
  content that would land in the Profile — **never `raw`**, so provider churn
  (rate-limit fields, timestamps) can't manufacture a phantom "update".
- **`classify.ts`** — `classifyCandidate`, the pure three-way merge decision
  (new / updated / conflict / unchanged / archive) exactly per the doc-12
  table. **The phase's non-negotiable rule is enforced here:** a user-edited
  item is never classified `updated` (the only auto-appliable state) — imports
  refresh their own untouched import, never a user edit.
- **`registry.ts`** — the static registry (`CONNECTORS`, `getConnector`,
  `listConnectors`), same code+PR+deploy pattern as templates.
- **`connectors/github.ts`** (`oauth2`, emits `project`) — `fetch` pages
  `GET /user/repos` sorted by push recency, using the cursor (newest
  `pushed_at`) for incremental refresh; `normalize` maps a repo → project
  candidate (homepage as canonical link with junk-URL guard, `html_url` →
  `repoUrl`, language+topics deduped → technologies, stars/forks metrics, owner
  avatar media, forks/archived skipped).
- **`connectors/rss.ts`** (`public`, emits `article`) — `fetch` GETs the feed
  and parses RSS 2.0 **and** Atom (`fast-xml-parser`) into a flattened entry
  shape; `normalize` maps entry → article candidate (feed title → publisher,
  HTML summary stripped to plain text so it satisfies the profile rich-text
  no-raw-HTML rule). The doc-12 "connector in an afternoon" + second-auth-mode
  proof.

## 2. Verification

- **39 unit tests, all green** — `defineConnector` accept/reject (7), candidate
  schema (6: payload-default reuse, unsafe-scheme rejection via the profile
  schema, per-kind discrimination, metric-key membership), fingerprint (5:
  determinism, `raw`-insensitivity, change detection, 16-hex shape), classify
  (6: every merge-table row + the **never-`updated`-when-edited invariant,
  fuzzed 1000×**), GitHub (7: normalize field mapping / fork+archived skip /
  junk-homepage fallback, `fetch` pagination + cursor + incremental watermark +
  non-ok throw, all against a fake in-memory `ctx`), RSS (8: RSS+Atom parse,
  normalize incl. HTML→plain-text, empty-title skip, `fetch`).
- **Full workspace:** `pnpm turbo lint typecheck test` → **43/43 tasks** green
  (was 40; +the new package's lint/typecheck/test).
- No database, no network, no accounts touched — the whole increment is pure.

The classify suite proves the doc-6 exit-criteria invariant ("editing an
imported item then re-syncing yields a **conflict**, never an overwrite") in
isolation, at the pure layer, before any runtime exists.

## 3. Docs synchronized

New `domains/integrations/CLAUDE.md`; root `CLAUDE.md` (added
`@resfolio/integrations` to the domains list); `DEVELOPMENT-PLAN.md` Phase 6
marked **foundation started** (🟡 with the contract/registry/GitHub-normalize/
RSS-normalize items ticked, runtime + inbox + account-gated remaining); doc 12
Open Questions records the seeded `MetricKey` vocabulary.

## 4. Next — the runtime increment (mostly not account-gated)

1. **DB tables + `./server` runtime** — `integration_connections` /
   `integration_items` / `integration_sync_runs` (+ migration), the staging
   upsert on `(connectionId, externalId)`, `classifyCandidate` wired against
   stored fingerprints, and **apply-to-draft** (a candidate → `@resfolio/profile`
   edit helper, provenance stamped). Plus the encrypted-token module
   (AES-256-GCM, key-versioned) — pure crypto, unit-testable.
2. **Review inbox** in the dashboard (new/updated/conflict/removed, field-level
   diff, inline edit, accept → draft).
3. **Live end-to-end via RSS** (public mode, no OAuth — fully local-verifiable):
   connect a feed URL → sync → candidates staged → accept → items in the draft.
4. **Account-gated:** GitHub OAuth app + routes, Trigger.dev scheduled sync, R2
   media rehosting; then LinkedIn `file` import.

## 5. How to run / test what shipped

No database, no accounts, no network.

```bash
pnpm --filter @resfolio/integrations test   # 39 unit tests
pnpm turbo lint typecheck test              # 43/43 tasks
```

## 6. Outstanding (carried, need account access)

Unchanged from SESSION-LOG-8: verify ISR tag-invalidation on a Vercel preview
deploy; run migrations `0003`/`0004` on the managed host; OAuth apps + Vercel
env; Sentry source-maps; R2 + Trigger.dev (cloud PDF); `resfolio.site`
subdomains. New for Phase 6 (deferred to their increments): the GitHub OAuth
app, the token-encryption key env, Trigger.dev for scheduled sync, R2 for media
rehosting.

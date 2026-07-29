# Resfolio Development Plan

Status: Accepted · Source docs: [architecture/01–12](README.md)

This is the build order for the platform. Each phase is independently
shippable, ends with working software (not scaffolding), and unblocks the
next. Phases are designed to be driven one at a time — "start phase N"
should be an unambiguous instruction.

A phase is **done** when its exit criteria pass and the
[definition of done](architecture/11-engineering-foundation.md) holds for
every PR in it (lint/typecheck/tests green, docs synchronized).

---

## Phase 1 — Workspace foundation & design system

**Status: complete (2026-07-14).** All deliverables landed except the Vercel
projects + preview deploys, which require account access — create the two
Vercel projects (`web`, `dashboard`) from the GitHub repo and set the
`TURBO_TOKEN` secret / `TURBO_TEAM` variable for CI remote caching.

**Goal:** the monorepo is production-shaped and both apps share one design
language. No product features.

- Rename `@repo/*` → `@resfolio/*` (ui, eslint-config, typescript-config)
  and update all consumers. _(Task vocabulary `typecheck`/`test` already
  landed with doc 11.)_
- `packages/env` (`@resfolio/env`) with `@t3-oss/env-nextjs`; ESLint rule
  banning direct `process.env`.
- Extract the landing-page theme into `packages/design`
  (`@resfolio/design`): Tailwind v4 `@theme` tokens, fonts, `card-surface`
  classes. `apps/web` consumes it and must be **visually unchanged**;
  `apps/dashboard` adopts it.
- shadcn/ui primitives generated into `@resfolio/ui`, themed via the shared
  tokens, exported through the public API only.
- CI: the GitHub Actions PR workflow (lint / typecheck / test / build,
  turbo remote caching, prettier check). Vercel projects + preview deploys
  for `web` and `dashboard`.
- Local infra: `docker-compose.dev.yml` (Postgres, Redis).

**Exit criteria:** `pnpm lint/typecheck/test/build` green in CI on a PR;
`apps/web` pixel-identical; `apps/dashboard` renders a themed placeholder using
`@resfolio/ui`.

**Risks:** the design extraction silently changing `apps/web` (mitigate:
before/after screenshot diff); rename churn breaking imports (mitigate:
single atomic PR, typecheck as the net).

---

## Phase 2 — Database, auth, and the dashboard shell

**Status: complete (2026-07-14).** All deliverables landed. Remaining user
actions (need account access): create the Google + GitHub OAuth apps and
set the dashboard env vars in Vercel (`DATABASE_URL`, `BETTER_AUTH_*`,
provider secrets; optionally `UPSTASH_*`, `SENTRY_DSN`/
`NEXT_PUBLIC_SENTRY_DSN`), pick the managed Postgres host (doc 07 open
question) and run migrations against it, then verify Google + GitHub
sign-in on a real preview deploy (the one exit criterion that can't run
locally — the e2e journey covers the flow with mocked OAuth). Sentry
source-map upload in CI is deferred until a Sentry project +
`SENTRY_AUTH_TOKEN` exist.

**Goal:** a real authenticated product shell. Docs: [10](architecture/10-auth-and-security.md), [07](architecture/07-storage.md), [08](architecture/08-dashboard-ux.md).

- `packages/database` (`@resfolio/database`): Drizzle client + migrations;
  Better Auth tables generated into it.
- `packages/auth` (`@resfolio/auth`): Better Auth server instance —
  **Google + GitHub social login only**, account linking on, DB sessions +
  cookie cache, host-only cookies.
- `apps/dashboard`: auth routes, login screen, optimistic middleware redirect,
  `(dashboard)` layout guard, `requireSession` action helper with the
  shared `ActionResult` type ([06](architecture/06-api-architecture.md)).
- Dashboard shell: sidebar navigation, top bar, command palette (cmdk),
  route groups per the IA in doc 08; Settings → account + linked accounts
  (link/unlink, last-provider guard).
- Security headers/CSP baseline in both apps; Upstash rate limit on auth;
  Sentry + Pino wiring (`packages/observability`).

**Exit criteria:** sign in with Google and GitHub end-to-end on a preview
deploy; linking both providers yields one account; protected routes bounce
unauthenticated users; e2e journey (mocked OAuth) green in CI.

**Risks:** OAuth redirect/cookie issues across preview URLs (mitigate: test
on real preview deploys early, not just localhost); Better Auth schema
drift with Drizzle migrations (mitigate: CLI-generated schema committed,
never hand-edited).

---

## Phase 3 — Profile engine + profile editor (form-first)

**Status: complete (2026-07-15).** All deliverables landed. The profile
engine (`@resfolio/profile`) ships schema v1, the migration chain,
`buildProfileView`, and pure edit helpers; storage (`profiles` +
`profile_versions`) with draft/publish and `draftRev` optimistic
concurrency; the section-based editor with drag reorder, debounced autosave,
save indicator, and Publish; the `@resfolio/fixtures` corpus; 53 domain unit
tests and a 4-journey profile e2e suite. The preview pane is deliberately
deferred to Phase 4 (Template SDK). No new user/account actions required
beyond the Phase 2 list; the profile migration runs via the same
deploy/e2e migration step.

**Goal:** users own a real Profile. The product's core domain exists and is
the best-tested code in the repo. Docs: [01](architecture/01-profile-engine.md), [06](architecture/06-api-architecture.md).

- `domains/profile` (`@resfolio/profile`): Zod schema v1 (finalize the
  per-section field lists and the rich-text subset — closes doc 01's open
  questions), `migrateProfile`, `buildProfileView`, pure edit helpers.
  Item ids, provenance fields, URL-scheme validation (doc 10).
- `@resfolio/fixtures`: the shared ProfileView corpus.
- Storage: `profiles` + `profile_versions` tables; draft/publish domain
  operations.
- Profile editor in `apps/dashboard`: section-based form (RHF + the domain
  schemas), drag reordering, debounced autosave to the draft via Server
  Actions, save indicator, Publish action (snapshot version). **Form-only
  in this phase** — the preview pane arrives with templates in Phase 4.
- Unit suites: schema, migration chain against fixtures, view builder
  (selection/deltas/ordering/determinism).

**Exit criteria:** create, edit, autosave, publish a profile end-to-end;
domain package has no framework imports; fixture-driven tests green.

**Risks:** schema churn after templates exist is expensive — spend the
design time here (mitigate: build the JSON Resume exporter mapping on paper
now to sanity-check field coverage); editor scope creep (mitigate: preview,
AI, imports all explicitly out of this phase).

---

## Phase 4 — Template SDK, first resume template, preview + PDF export

**Goal:** the "many outputs" promise becomes real: a resume rendered
identically in preview and PDF. Docs: [05](architecture/05-template-sdk.md), [02](architecture/02-resume-rendering.md), [09](architecture/09-rendering-pipeline.md).

**Status: product-complete (2026-07-15) — 4A–4F done.** The
`Resolve → Project → Render → Deliver` pipeline is built and verified locally
end-to-end, and both editor pieces (documents + `/resumes` UI, the in-browser
live preview) ship. The only remaining Phase-4 items are **account-gated**:
the cloud delivery adapters (R2 + Trigger.dev + Redis nonces) and the CI
preview↔PDF parity diff (which lands with template #2 in Phase 5). The docs'
mandated "spike the Playwright→PDF→R2 path first" is satisfied (local disk,
cloud endpoints stubbed behind seams).

- ✅ **4A** `packages/template-sdk`: `defineTemplate`, ProfileView contract v1,
  theme tokens, deterministic format + rich-text helpers — `kind: "resume"`
  only. 30 unit tests.
- ✅ **4B** first resume template (`templates/resume-classic`): semantic,
  flow-layout, physical units, inline SVG icons, self-hosted Manrope. The
  ATS check caught (and drove the fix for) letter-spacing that split heading
  glyphs in the text layer.
- ✅ **4C** `apps/sites` (port 3002) with the **print route** (token-guarded,
  signed short-TTL HMAC tokens) — before any public pages. Fixture + DB
  resolve sources; DB imported dynamically so the fixture path needs no DB.
- ✅ **4D** PDF export **spike**: Playwright → content-hash cache
  (`LocalFsExportStore`) → PDF on disk; second export of unchanged content is
  a cache hit (no Chromium boot); ATS text-extraction check (headings in
  reading order, visible URLs survive). Cloud wiring stubbed behind
  `ExportStore` + token-signer seams.
- ✅ **4E** `documents` table + `@resfolio/document` domain + resume documents
  UI (create/name, A4/Letter, margins, accent, icons).
- ✅ **4F** Editor preview pane: the `SplitWorkspace` layout primitive; the
  `resume-classic` template rendered **in-browser** in a scaled page box with
  optimistic client-side `buildProfileView`; advisory pagination overlay.
- ✅ **4G — resume experience rebuild** (2026-07-17, doc 02 revision). The
  **print token is gone**: `documents.visibility` (`public` default | `private`,
  migration `0007`) gates a **permanent public URL**, and the token was the
  cause of five of the route's six 404 paths. `@resfolio/document/token` is
  deleted; `PRINT_TOKEN_SECRET` → **`RENDER_SECRET`** (server-to-server only:
  `/api/revalidate`, the export API, the private draft render). New routes:
  public `/render/resume/[documentId]` (published version, force-dynamic,
  noindex), private `/render/resume/[documentId]/draft` (bearer), dev-only
  `/render/resume/fixture/[key]` (what `check:ats` loads — the fixture path
  lost its vehicle when the inline token payload went away). **Download PDF**
  ships: dashboard `GET /api/resumes/[id]/pdf` (session + ownership) → sites
  `POST /api/export/resume/[documentId]` (bearer) → `lib/pdf.ts`. Fixed the
  **renderKey staleness bug**: `source`+`ref` → a single `revision`
  (`draft:<draftRev>` | `version:<id>` | `fixture:<key>`), because `ref` was a
  userId that never changed when the draft did.
- ✅ **4H — resume configuration layer** (doc 01/02). `updateResumeAction` now
  accepts `view`; the editor gained **Sections** (locked core rows; toggles for
  projects/skills/writing/certifications/awards/languages/custom; per-item
  checkbox + dnd-kit reorder) and **Sharing** (visibility + the public link).
  No migration and no domain change: `ViewDefinition` and `documents.view`
  already modelled all of it — the only gap was that nothing could _write_ a
  non-`{}` value. `lib/resume-sections.ts` is pure and tested against the real
  `buildProfileView`.
- ⏳ **Cloud delivery** (needs account access): swap `LocalFsExportStore` →
  `R2ExportStore` and wrap the export route's body in a Trigger.dev task
  (`lib/pdf.ts` imports Playwright dynamically, so a deployment without it
  answers 501 rather than bundling Chromium). `R2` + `assets` table land here.
- ⏳ CI: template contract harness — visual snapshots of the resume route, the
  preview↔PDF parity diff (arrives with template #2). The ATS text-extraction
  check exists now (`pnpm --filter sites check:ats`).

**Exit criteria:** edit → see paginated preview → export → PDF matches
preview, links clickable, text extractable; second export of unchanged
content is a cache hit (no Chromium boot); parity test green in CI.
_Met: edit → in-editor paginated live preview (4F), export → PDF with
extractable text in order and clickable links, cache hit on unchanged content.
Outstanding (account-gated): the CI preview↔PDF parity diff, which lands with
template #2 in Phase 5._

**Risks:** **highest-risk phase.** Chromium-in-Trigger.dev packaging and
cold starts (mitigate: spike the Playwright→PDF→R2 path in week one of the
phase, before the editor pane); font licensing/embedding for print
(resolve when picking template fonts); pagination-overlay accuracy
(mitigate: it's advisory by design — ship without it if it fights back,
add after).

---

## Phase 5 — Portfolio: templates, public sites, publish

**Goal:** `resfolio.me/p/<username>` is live. Docs: [03](architecture/03-portfolio-rendering.md), [04](architecture/04-deployment.md).

**Status: product-complete (2026-07-16).** Sessions 1–2 built the SDK
portfolio contract, the first portfolio template, and the **public rendering
host**. Session 3 closed the phase: the DB `sites` table + `@resfolio/portfolio/server`
(owner CRUD, `getSiteForRender`, `publishSite`), the DB-backed `resolve-site`
swap + the `apps/sites` on-demand revalidation endpoint, the **dashboard
portfolio section** (slug claim, template pick, schema-driven config form,
publish, template switch), the **draft-preview route + editor iframe** (signed
preview token, CSP frame-ancestors carve-out), **platform SEO** (JSON-LD
`Person`, canonical URLs, per-discoverable `sitemap.xml`/`robots.txt`), and the
**second portfolio template** (`portfolio-sidebar`). The only remaining Phase-5
items are **account-gated**: verifying ISR tag-invalidation on a Vercel preview
deploy (the publish flow now exists) and acquiring `resfolio.site` for
subdomains (V1.x only).

**Session 4 (post-phase refinements, 2026-07-16).** Publish state is now
accurate on both editors: the profile's Publish disables when the draft matches
the published version (`ProfileDraft.hasUnpublishedChanges`), and the site's
Publish re-enables on any presentation edit — template switch, config, or
discoverable — via a new `sites.has_unpublished_changes` column (migration
`0004`) that publish clears and `updateSite` sets. The template selector's
stuck-after-switch bug is fixed (the editor remounts on the template `key`).
The dashboard design system was rounded out — `Select`, `Checkbox`, `Switch`,
and `Card` primitives added to `@resfolio/ui` and swapped in across the profile,
portfolio, and resume editors (no more raw HTML controls). And portfolio
**config was trimmed to content/visibility only** (the doc-03 opinionated-
templates decision): `accent`, `heroLayout`, `sidebarPosition`, and `density`
removed; templates now own all styling.

- ✅ **SDK `kind: "portfolio"`** — `PortfolioTemplateDefinition` (a `pages`
  renderer map), `capabilities.pages` over the platform route table
  (`PORTFOLIO_PAGE_KINDS`), `PortfolioPageProps` (`{ view, config, theme,
params, basePath }`). `defineTemplate` enforces page coverage (`home`
  mandatory, every declared page rendered, no stray renderers). `resolveTheme`
  is now kind-agnostic. +5 SDK unit tests (35 total).
- ✅ **First portfolio template** (`templates/portfolio-minimal`) — home,
  projects, project detail, about, resume; two themes (dark/light), serif
  editorial language ported from `apps/web/design-refs/portfolio/`; universal
  RSC pages; `.rf-site`-scoped self-contained stylesheet; 12 render-harness
  tests against the fixture ProfileViews (doc 05 impl step 4 seed).
- ✅ **`apps/sites` public rendering** — the catch-all
  `/p/[username]/[[...slug]]`, Site resolution (`lib/resolve-site.ts`, fixture
  source now; DB source is a dynamic-import seam), the portfolio template
  registry (`lib/portfolio-templates.ts`), the platform route table
  (`@resfolio/portfolio` `resolvePortfolioRoute`), ISR + `site:<id>` cache tags,
  and `generateMetadata` honoring the discoverable toggle. Verified end-to-end
  (home/projects/detail/about render with self-hosted fonts; unknown route +
  unknown username 404). `revalidateTag` on publish lands with the `sites` table.
- ✅ **`domains/portfolio`** — pure root (slug rules + reserved-word blocklist,
  route table, `SiteRecord`) **plus** the `./server` surface (the `sites` table,
  owner-scoped CRUD, `getSiteForRender`/`getSiteIdBySlug`, `listDiscoverableSites`,
  and `publishSite` — pins the profile's published version; the app layer calls
  the `apps/sites` revalidation endpoint) and the `./token` preview token.
- ✅ **`sites` table** (`packages/database`, migration `0003`) + the DB-backed
  `resolve-site` swap (fixture source kept for CI; DB gated on `DATABASE_URL` so
  the fixture path 404s cleanly with no DB) + `apps/sites` `POST /api/revalidate`
  (secret-guarded on-demand `revalidateTag`).
- ✅ **Dashboard portfolio section** — slug claim with live availability check,
  template pick, the **schema-driven settings form** (generated from the
  template's `configSchema` via `describeConfigSchema`), discoverable toggle,
  publish, and live **template switch** (proves URL-stable switching).
- ✅ Draft-preview route (`apps/sites/preview/portfolio`, signed preview token)
  - the portfolio preview **iframe** in the editor (CSP `frame-ancestors`
    carve-out; re-minted per save so it never expires mid-session).
  - ⛔ **Both removed 2026-07-18.** Rendering the whole portfolio app after
    every save is a cost that scales with the template catalogue, paid to
    answer a question a cheaper artefact answers. The editor shows a
    placeholder pane; the replacement (likely a stored snapshot rather than a
    live iframe) is an open question in doc 09.
- ✅ Platform SEO: per-page metadata + canonical URLs, JSON-LD `Person`
  (home only), `sitemap.xml` (discoverable sites, template-aware page set) and
  `robots.txt` honoring the discoverable toggle.
- ✅ **Second template** (`@resfolio/template-portfolio-sidebar`) — a two-column
  sidebar layout with a _different_ config shape (exercises the schema-driven
  form) and the same route table (proves URL-stable switching). Both templates'
  render harnesses seed the CI visual-snapshot layer.

**Follow-ups (next portfolio increment — not account-gated):**

- **Per-site view tailoring** — the content-selection surface: show/hide
  sections, reorder, and choose which projects/experiences/skills display. The
  seam already exists — `sites.view` (a ViewDefinition, `{}` = identity) flows to
  `buildProfileView` — so this is wiring the projection through render + building
  the editor UI (schema-driven, alongside the config form). This is the "what
  shows" half of the doc-03 config decision; the "styling stays opinionated"
  half shipped in session 4.
- A dashboard **portfolio e2e** (claim → configure → publish), deferred with the
  DB + auth-mock harness the resume e2e uses.
- Optional `RadioGroup` primitive to replace the claim screen's radio-cards.

**Exit criteria:** publish → public URL serves cached pages → edit + publish
again → page updates via tag invalidation; template switch preserves URLs;
Lighthouse ≥ 95 on the portfolio home; preview iframe shows draft changes.
_Met: the publish flow pins the version and invalidates `site:<id>` (the
cross-deployment invalidation via `apps/sites`'s revalidation endpoint — final
proof on a Vercel preview deploy is the one account-gated carry-over); template
switch preserves URLs (both templates share the platform route table + `href`
seam, asserted in the render harness); the preview iframe renders the real draft
through the template. The public route + SEO surfaces were verified end-to-end
against a production build (fixture source)._

**Risks:** ISR/tag behavior differing between local and Vercel (mitigate:
verify invalidation on preview deploys early); SDK contract feeling wrong
with only one template (mitigate: the second template is in-phase, not
deferred); slug/abuse squatting at launch (blocklist + rate limit).

---

## Phase 6 — Imports V1 (import → route → review → apply)

**Goal:** the Career-OS differentiator: import professional content from
external sources into the Profile through an **import workspace**. Providers
are import sources only; imported content becomes ordinary Resfolio data.
Doc: [12](architecture/12-integrations-and-sync.md) (revised 2026-07-16 to
import-first — the sections below follow the revision's 6R phases).

**Status: 6R-1 → 6R-3 built and verified (2026-07-16).** The sync-era
machinery that survived unchanged: the connector contract + `FetchContext`
seam, `computeFingerprint`, registry, GitHub + RSS connectors' fetch/
normalize, the staging tables (migration `0005`), the key-versioned
AES-256-GCM token module, the owner-scoped repository, budgeted
token-injecting fetch, staging upsert on `(connectionId, externalId)`, and
apply-to-draft with provenance + optimistic-concurrency retry. Deleted by
the revision: the three-way conflict merge, archive suggestions, the
auto-accept surface (column dormant), and the sync-shaped `/sources` inbox.

- ✅ **6R-1 — Architecture (pure layer).** Candidate kinds cover the Profile
  (`experience`, `education`, `skillGroup`, `certification`; `unclassified`
  as the escape hatch); routing is data (`routing.ts`: per-kind defaults,
  `COMPATIBLE_ROUTE_TARGETS` validation, connector declarations sanitized to
  unrouted, user override at import); `classifyCandidate` re-specced to
  `new | duplicate | refresh_available`; `detectUserEdit` extracted as the
  pure re-import-warning primitive; `capabilities` → `{ refreshable,
incremental }` (schedule/webhooks dropped). Classify/apply/routing tests
  rewritten (78 package tests).
- ✅ **6R-2 — Runtime.** Additive migration `0006` (route columns +
  state-value migration, applied locally); `syncConnection` → `runImport`
  (duplicate-skip, dismissals sticky, prunes unseen never-imported rows,
  receipts untouched by upstream deletion); `acceptItem` →
  `importItem(itemId, { routeTo?, customSectionTitle?, edits? })` with
  payload↔section validation and unrouted refusal. **Live RSS end-to-end
  proof re-run under import semantics** (routed staging → import with
  provenance → idempotent re-run → refresh badge with draft untouched →
  user-edit warning → explicit warned re-import → upstream deletion produces
  nothing → unrouted refusal → route-to-custom).
- ✅ **6R-3 — Import workspace UI.** `/sources` rebuilt: "Import from…"
  provider gallery, triage grouped by destination with per-group Import all,
  destination Select, inline edit-before-import and Skip, the "needs a home"
  bucket, import history (receipts, refresh badges, warned re-import, links
  into `/profile`), and the demoted "Connected sources" row (Check for
  updates / Remove).
- ✅ **6R-5 — Breadth + optional refresh.** Dev.to / Stack Overflow
  connectors; user-initiated "Check for updates" for `refreshable` providers
  (`refresh_available` badge + warned re-import — no scheduling).
- ✅ **6R-6 — V1 provider set closed** (2026-07-17, doc 12 revision).
  **GitHub `oauth2` → `public`**: `GET /users/{username}/repos` answers
  everything a project needs, so the OAuth app was never needed — the scopes
  only bought private repos. Proven live against api.github.com. Imports only
  the named fields (name, description, repoUrl, stars, forks, language,
  topics); `created_at` and the owner avatar deliberately dropped. An optional
  server-wide `GITHUB_TOKEN` lifts the anonymous 60 req/hr **per-IP** ceiling
  to 5,000 — a rate lever, not auth, and only a _connection_ token may raise
  `needs_reauth`. Gallery = four live cards, no teasers.
  **6R-4 (LinkedIn file import) was built and then deleted** — a scope
  decision (doc 12, "Assumptions challenged"); the connector, its CSV parser,
  the ZIP extractor and `fflate` all went with it. `ITEM_SOURCES` keeps
  `"linkedin"`: that enum is additive-only and removing a value would
  invalidate already-imported items.
- ⏳ Account-gated: R2 media rehosting, Redis rate limits.

**V1 providers: GitHub, Dev.to, RSS, Stack Overflow — all `public`, no OAuth,
no credentials at rest.** Everything else is evaluated individually, on the
quality of its public API, when someone asks.

**Exit criteria:** import from a source → candidates staged and routed →
import → items in draft with provenance, ordinary and fully editable →
re-running the import is idempotent (duplicates silently skipped) →
unmappable content waits in "needs a home" instead of being dropped →
replacing a user-edited copy is possible only via an explicit, warned
re-import.

**Risks:** provider API surprises (mitigate: fixtures recorded from real
accounts; failure classification built before the second connector);
token encryption key handling mistakes (mitigate: it's one audited module in
the runtime, never inline — and moot in V1, where no connector stores a
credential); users expecting live sync (mitigate: honest copy — "Import from
GitHub", "Check for updates"); scope creep toward many connectors (mitigate:
breadth is demand-driven, and the V1 set is closed).

---

## Phase 7 — Launch hardening: billing, domains, polish

**Goal:** money, custom URLs, and production confidence.

- Stripe: `subscriptions` mirror, checkout + portal, webhook handler, plan
  gating (custom domains, version retention, template access — finalize the
  tier matrix, a doc-07/product open question).
- Subdomains (`<username>.resfolio.site`, wildcard + middleware) and
  custom domains (CNAME + Vercel Domains API, Redis host mapping) — doc 04
  phases 2–3.
- Ops: GC/pruning jobs (orphaned exports, version retention), uptime
  checks, Sentry alert rules, PostHog dashboards + portfolio page beacon,
  axe scans in CI, Lighthouse budget checks, landing-page waitlist → real
  signup.

**Exit criteria:** a paying user on a custom domain with an imported,
published profile — and every operational safeguard from doc 11 live.

**Risks:** Stripe webhook edge cases (mitigate: use Better Auth's Stripe
plugin or the well-worn mirror pattern; test with Stripe CLI clocks);
custom-domain TLS/support burden (mitigate: paid-tier only, ship subdomains
first and watch volume).

---

## Phase 8 — Native blog

**Goal:** users write in Resfolio and the writing becomes part of the Profile.

**Status: authoring half complete (2026-07-18).** Creating, editing, storing,
and deleting posts works end to end in the dashboard. **Rendering posts on
portfolios and the public site is deliberately out of this slice** — the
architecture is built for it (see the seams below), but no template renders a
post yet.

- ✅ **`blog_posts` table** (migration `0011`) + **`@resfolio/blog`**. A post is
  its own row, not a profile section: the profile JSON is rewritten in full on
  every autosave and snapshotted in full on every publish, so unbounded prose
  inside it would make both costs scale with how much the user has written.
- ✅ **Body = TipTap/ProseMirror JSON** over an explicit node whitelist, a
  second content shape alongside the profile's Markdown subset rather than a
  widening of it: that subset is small so a resume survives ATS text
  extraction, and headings/code blocks/task lists/callouts are not expressible
  in it. Raw HTML is **unrepresentable**, not filtered — no whitelisted node
  carries markup.
- ✅ **Derived values are derived**: `readingMinutes` has no field in the update
  schema at all (never user-editable, per the requirement), excerpts fall back
  to opening prose only while the author has written none, and `publishedAt` is
  stamped once on first publish and never moved.
- ✅ **Writing-section projection**: the pure `withNativePosts` merges published
  posts into `sections.writing` _before_ `buildProfileView`, so `@resfolio/profile`
  never learns about the blog and the view builder stays pure, synchronous and
  database-free (which is what lets the dashboard run it in the browser).
- ✅ **Images over R2** with upload / drag-drop / paste-at-cursor, a
  **configurable** per-post ceiling (`BLOG_MAX_IMAGES_PER_POST`, default 5)
  enforced at both upload and repository, and **reference-counted cleanup** on
  delete: content-hash dedupe means one image used in two posts is one object,
  so a post's images are released only against what every remaining post still
  references. Fixed a latent bug found on the way: `blogCover` was
  `singleton: true`, and `singleton` is owner-scoped — a second post's cover
  would have superseded the first's.
- ⏳ **Rendering** (the other half): a `blog`/`blogPost` renderer in the
  portfolio templates (doc 05 already declares both page kinds), the public
  routes in `apps/sites`, and a node-walker that turns the body JSON into React
  elements — reusing the `.rf-prose` stylesheet the editor already writes
  against, so reading and writing cannot drift.

**Exit criteria (authoring):** create → write with full rich text → paste an
image and see it upload → autosave → publish → the post appears in the Profile's
Writing projection → delete removes the row and only the images no other post
uses. _Met._

---

## Post-launch tracks (demand-ordered, not scheduled)

- **Connector breadth** — GitLab, Hashnode, YouTube, Hugging Face, Figma,
  Notion, Product Hunt, Dribbble; Tier B (CodePen, Kaggle, LeetCode) behind
  beta labels after ToS review; LinkedIn's export ZIP if it earns its way
  back. Each evaluated on its public API when asked for, not scheduled — the
  V1 set (GitHub, Dev.to, RSS, Stack Overflow) is closed.
- **AI enrichment** — enrich stage in the integration pipeline; AI deltas
  in the editor (doc 01/09/12 seams).
- **Native blog** (Phase 8) — **the authoring half shipped 2026-07-18**; see
  the Phase 8 section below. Rendering posts on portfolios and the public site
  is the remaining half. Notion-as-CMS reuses connections.
- **GitHub webhooks**, template gallery growth, dark mode, mobile editing,
  public API extraction (doc 06 trigger), teams/orgs.

## Cross-phase risk register

| Risk                                       | Phase | Mitigation                                                                                                     |
| ------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| Preview ≠ PDF (the product's core claim)   | 4     | same-engine architecture + parity test in CI; spike PDF path first                                             |
| Profile schema locked in too early         | 3     | fixture corpus + migration machinery from day one; JSON Resume mapping as a coverage check                     |
| Third-party API instability                | 6+    | connector isolation, failure classification, `degraded` state, Tier B labeling                                 |
| Vercel cost surprises at scale             | 5+    | ISR-by-tag keeps renders ∝ publishes; portability preserved (doc 04)                                           |
| Single-developer bandwidth / scope creep   | all   | phases end with shippable slices; "post-launch tracks" is the pressure valve — cut breadth, never the pipeline |
| Security regression via UGC on our domains | 3, 5  | schema-level URL validation, no-raw-HTML rule, CSP, R2-only images — enforced in code + ESLint, not convention |
| Docs drifting from code                    | all   | root CLAUDE.md rule: architecture changes update the doc in the same PR                                        |

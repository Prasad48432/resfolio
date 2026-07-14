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

- `packages/template-sdk`: `defineTemplate`, ProfileView contract v1, theme
  tokens — `kind: "resume"` only.
- First resume template (semantic, flow-layout, physical units, inline SVG
  icons, self-hosted fonts).
- Scaffold `apps/sites` (port 3002) with the **print route** (token-guarded,
  signed 5-minute tokens) — before any public pages.
- `documents` table + resume documents UI (create/name/select template,
  A4/Letter config).
- Editor preview pane: the split-workspace layout primitive; resume
  template rendered in-browser in a scaled page box with optimistic
  client-side `buildProfileView`; pagination overlay.
- PDF export: Trigger.dev task (Playwright → R2 content-hash cache → signed
  download URL); R2 + `assets` table land here.
- CI: template contract harness — visual snapshots of the print route, ATS
  text-extraction check, the preview↔PDF parity diff.

**Exit criteria:** edit → see paginated preview → export → PDF matches
preview, links clickable, text extractable; second export of unchanged
content is a cache hit (no Chromium boot); parity test green in CI.

**Risks:** **highest-risk phase.** Chromium-in-Trigger.dev packaging and
cold starts (mitigate: spike the Playwright→PDF→R2 path in week one of the
phase, before the editor pane); font licensing/embedding for print
(resolve when picking template fonts); pagination-overlay accuracy
(mitigate: it's advisory by design — ship without it if it fights back,
add after).

---

## Phase 5 — Portfolio: templates, public sites, publish

**Goal:** `resfolio.me/p/<username>` is live. Docs: [03](architecture/03-portfolio-rendering.md), [04](architecture/04-deployment.md).

- SDK extended for `kind: "portfolio"` (pages map, capabilities).
- `apps/sites` public rendering: catch-all route, Site resolution (Redis
  cached), template registry dispatch, ISR + `revalidateTag` on publish.
- First portfolio template (home, projects, project detail, about, resume
  page). Port the visual language from `apps/web/design-refs/portfolio/`.
- `sites` table; portfolio section in the dashboard: slug claim (with
  reserved-word blocklist), template pick, theme/config (schema-driven
  form), publish flow.
- Draft-preview route (signed tokens) + the portfolio preview iframe in the
  editor — the full "never edit blindly" split workspace.
- Platform SEO: metadata, JSON-LD, per-site sitemap/robots, discoverable
  toggle. CSP with frame-ancestors carve-out for the preview route.
- **Second template** (resume or portfolio) to prove the SDK contract.

**Exit criteria:** publish → public URL serves cached pages → edit + publish
again → page updates via tag invalidation; template switch preserves URLs;
Lighthouse ≥ 95 on the portfolio home; preview iframe shows draft changes.

**Risks:** ISR/tag behavior differing between local and Vercel (mitigate:
verify invalidation on preview deploys early); SDK contract feeling wrong
with only one template (mitigate: the second template is in-phase, not
deferred); slug/abuse squatting at launch (blocklist + rate limit).

---

## Phase 6 — Integrations V1 (import → review → apply)

**Goal:** the Career-OS differentiator: connect GitHub, review candidates,
apply to the Profile. Doc: [12](architecture/12-integrations-and-sync.md).

- `domains/integrations` (`@resfolio/integrations`): connector contract +
  registry, runtime (encrypted token storage, rate-budgeted fetch,
  Trigger.dev sync task, staging tables, fingerprint diffing, media
  rehosting to R2).
- **GitHub connector** (oauth2 mode) emitting project/contribution
  candidates, with recorded fixtures + normalize tests.
- **Review inbox** in the dashboard: new/updated/conflict/removed states,
  field-level diffs, inline edit, accept → draft apply with provenance.
- **RSS connector** (public mode) — proves the cheap path and covers
  Medium/Substack/blogs in one stroke.
- Scheduled refresh (jittered daily), manual sync (rate-limited),
  per-connection auto-accept toggle, `needs_reauth`/`degraded` connection
  health UI, sync-run log.

**Exit criteria:** connect GitHub → candidates staged with rehosted images
→ accept → items in draft with provenance → re-sync is idempotent (no
dupes) → editing an imported item then re-syncing yields a conflict, never
an overwrite. RSS connector lands in under a day of work (the architecture
claim, tested).

**Risks:** provider API surprises (mitigate: fixtures recorded from real
accounts; failure classification built before the second connector);
token encryption key handling mistakes (mitigate: it's one audited module
in the runtime, never inline); scope creep toward many connectors
(mitigate: exactly two in this phase — breadth is post-launch, demand-driven).

---

## Phase 7 — Launch hardening: billing, domains, polish

**Goal:** money, custom URLs, and production confidence.

- Stripe: `subscriptions` mirror, checkout + portal, webhook handler, plan
  gating (custom domains, version retention, template access — finalize the
  tier matrix, a doc-07/product open question).
- Subdomains (`<username>.resfolio.site`, wildcard + middleware) and
  custom domains (CNAME + Vercel Domains API, Redis host mapping) — doc 04
  phases 2–3.
- LinkedIn **file import** (doc 12, file mode) — high-demand, closes the
  "LinkedIn?" question honestly.
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

## Post-launch tracks (demand-ordered, not scheduled)

- **Connector breadth** — GitLab, Dev.to, Hashnode, Stack Overflow,
  YouTube, Hugging Face, Figma, Notion, Product Hunt, Dribbble; Tier B
  (CodePen, Kaggle, LeetCode) behind beta labels after ToS review.
- **AI enrichment** — enrich stage in the integration pipeline; AI deltas
  in the editor (doc 01/09/12 seams).
- **Blogs / custom pages** — new page kinds through SDK capabilities + the
  content domain; Notion-as-CMS reuses connections.
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

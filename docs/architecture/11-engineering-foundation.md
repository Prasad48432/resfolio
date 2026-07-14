# 11 — Engineering Foundation

Status: Accepted

## Problem Statement

Documents 01–10 decide the product architecture; several of them lean on
infrastructure that existed only as references — "CI visual regression,"
"snapshot tests keyed by renderKey," "validated env," "Sentry." Without one
document deciding the testing strategy, CI pipeline, observability wiring,
and workspace conventions, each feature PR would improvise them, and the
quality bar (Lighthouse 95+, WCAG AA, no silent regressions across ~10+
templates) would depend on memory instead of machinery.

## Proposed Architecture

### Workspace task vocabulary

Every package/app exposes the same turbo task names — `dev`, `build`,
`lint`, `typecheck`, `test` (plus `test:e2e` where Playwright exists). The
scaffold's `check-types` is renamed to `typecheck` so the root commands are
uniformly `pnpm lint / typecheck / test / build`. A package with nothing to
test simply omits the script; turbo skips it.

Ports are fixed: `web` 3000, `dashboard` 3001, `sites` 3002.

### Environment validation: `packages/env`

`@resfolio/env` uses `@t3-oss/env-nextjs` with one schema module per
concern (`database`, `auth`, `redis`, `r2`, `observability`…). Each app
composes only the slices it needs into its own `env.ts`; builds fail on
missing/invalid vars. Nothing reads `process.env` directly outside this
package (ESLint-enforced). Secrets policy per
[10-auth-and-security](10-auth-and-security.md).

### Testing strategy — a deliberately bottom-heavy pyramid

The architecture concentrates logic in pure functions (`domains/*`,
`buildProfileView`, migrations, templates-as-data), which is exactly what
unit tests are good at. Test where the logic is:

1. **Unit (Vitest) — the bulk.** Co-located `*.test.ts`. Non-negotiable
   suites: profile schema validation, the migration chain against the
   fixture corpus, `buildProfileView` (selection/deltas/ordering,
   determinism, isomorphism), slug/domain rules, action-helper error
   normalization. A shared `@resfolio/fixtures` corpus of realistic
   ProfileViews feeds unit, template, and e2e tests alike so "sample data"
   exists exactly once.
2. **Template contract tests (Vitest + Playwright).** Per registered
   template, generated from the registry: config schema validity, every
   declared page renders the fixture corpus without error, **visual
   regression screenshots** of the print/preview routes (Playwright
   `toHaveScreenshot`, snapshots committed, Linux-only baseline to avoid
   OS font drift), and for resume templates the **ATS extraction check** and
   the **preview↔PDF parity diff** from
   [02](02-resume-rendering.md)/[09](09-rendering-pipeline.md).
3. **E2E (Playwright) — thin.** A handful of journeys against a real local
   stack: sign in (mocked OAuth), edit profile → autosave → preview updates,
   publish → public page reflects it, export → PDF downloads. Selectors use
   the mandated `data-testid`s. Axe accessibility scan runs on dashboard
   shell and one rendered portfolio per template.

Local infra for tests: Postgres + Redis via `docker-compose.dev.yml`
(Upstash/Neon are wire-compatible enough for CI).

### CI/CD — GitHub Actions + Vercel git integration

- **Every PR**: one workflow, pnpm + turbo with **remote caching** so only
  affected packages rebuild — `lint`, `typecheck`, `test`, `build`, then
  template-contract + e2e jobs (services: postgres/redis) gated on affected
  paths. `prettier --check` included. Zero warnings policy stays
  (`--max-warnings 0`).
- **Deploys**: Vercel git integration — every PR gets preview deployments
  per app; merge to `main` deploys production. No hand-rolled deploy
  scripts. DB migrations run as a pre-deploy step (drizzle-kit migrate
  against the production database, executed in CI before promoting).
- **Branch policy**: PRs only, `main` protected, squash-merge with
  Conventional Commit titles (existing convention). No changesets/publishing
  — all packages are private workspace consumers.
- **Scheduled**: the GC/pruning jobs live in Trigger.dev
  ([07-storage](07-storage.md)), not CI cron.

### Observability: `packages/observability`

One thin package, three concerns, consistent everywhere:

- **Logging — Pino**: a `createLogger(scope)` with standard serializers and
  **redaction** (emails, tokens, profile content never logged). Server-side
  only; pretty transport in dev, JSON in prod. Every action/route log line
  carries `{ userId?, requestId }`.
- **Errors — Sentry**: initialized per app (`apps/dashboard`, `apps/sites`, and
  Trigger.dev tasks) via shared config; the action helper
  ([06-api-architecture](06-api-architecture.md)) captures unexpected
  failures with context, while expected `ActionResult` errors are _not_
  noise-reported. Source maps uploaded in CI.
- **Product analytics — PostHog**: client capture in the dashboard, server
  capture for the events that matter to the business (signup, publish,
  export), and the lightweight beacon on portfolio pages
  ([04-deployment](04-deployment.md)). Analytics never blocks rendering;
  public pages respect the per-site opt-out.

Uptime/alerting: Sentry alerts + a simple external uptime check on
`resfolio.me`, `app.resfolio.me`, and one canary portfolio. Deeper APM is
deferred until there's traffic to profile.

### Definition of done (every feature PR)

lint + typecheck + tests green · new logic has unit tests · user-visible
flows touched → e2e or template snapshot updated deliberately (snapshot
diffs are reviewed, not rubber-stamped) · docs/CLAUDE.md updated when
conventions changed · no new `process.env`, `any`, or `dangerouslySetInnerHTML`.

## Tradeoffs

- **Committed visual snapshots** bloat the repo slightly and demand a fixed
  rendering platform (Linux CI) — accepted; they're the only honest guard
  for a product whose output _is_ pixels, and Linux-only baselines kill the
  flakiness that makes teams delete visual tests.
- **Thin e2e** means some integration bugs surface in previews rather than
  CI — accepted in exchange for a suite that stays fast and trusted; the
  bottom-heavy pyramid is only valid because the architecture keeps logic
  pure, which is itself a reason to defend that architecture.
- **Vercel git integration** over bespoke pipelines trades deploy
  flexibility for zero maintenance — consistent with
  [04-deployment](04-deployment.md); migrations-in-CI is the one custom step.
- **A shared observability package from day one** slightly front-loads
  setup, but three apps and a job runner all need identical wiring —
  extracting it later means unwinding three copies.

## Future Scalability

- Turbo remote caching + affected-only jobs keep CI time flat as
  packages/templates multiply; template contract tests are generated from
  the registry, so template #30 costs CI minutes, not authoring.
- Load/perf testing (k6 against `apps/sites`) and Lighthouse CI budgets can
  bolt onto the same PR workflow when traffic justifies them.
- If the repo outgrows GitHub-hosted runners, self-hosted runners change a
  YAML line, not the strategy.
- The observability package is where request tracing (OpenTelemetry) would
  land later without touching call sites.

## Implementation Strategy

1. **Now (this change)**: rename `check-types` → `typecheck` across root,
   `turbo.json`, and all packages; add the `test` task and root script so
   the root `CLAUDE.md` commands are true.
2. In Phase 1 (per `docs/DEVELOPMENT-PLAN.md`, which governs sequencing):
   `@resfolio/env` + the PR workflow (lint/typecheck/test/build + turbo
   remote cache); Vitest workspace setup lands with the first domain
   package.
3. With auth ([10](10-auth-and-security.md)): docker-compose for local
   Postgres/Redis, Sentry + logger wiring, migration step in deploy.
4. With the first template: the template contract harness + visual
   snapshots + ATS/parity checks.
5. With the editor: Playwright e2e journeys + axe scans.

## Open Questions

- Dead-code enforcement (knip) and import-boundary linting (no
  `domains → apps`, public-API-only imports — eslint-plugin-boundaries?) —
  adopt once the domain packages exist; boundary linting is likely worth it
  early.
- OAuth mocking approach for e2e — **decided (Phase 2)**: a tiny local
  OAuth2 authorization server (`apps/dashboard/e2e/mock-oauth-server.ts`)
  plus two `genericOAuth` mock providers registered by `@resfolio/auth`
  only when `AUTH_E2E_MOCK_ISSUER` is set; the instance refuses to boot
  unless that issuer is localhost. The e2e suite drives the real
  redirect → consent → callback → session flow, including account linking.
- Lighthouse CI on PRs from day one vs. post-launch — leaning post-launch
  with manual checks until pages stabilize.

## Alternatives Considered

- **No dedicated doc / conventions accrete in PRs** — the default entropy
  path; rejected for the same reason as logic-in-actions in
  [06](06-api-architecture.md).
- **Test-heavy e2e pyramid** (Cypress-everything) — slow, flaky, and
  redundant here: the architecture's pure core makes unit tests carry the
  real weight.
- **Chromatic/Percy for visual regression** — nicer review UI, per-snapshot
  pricing at template × page × theme scale; Playwright snapshots in-repo are
  free and reviewable in the PR diff. Revisit if snapshot review becomes a
  bottleneck.
- **Changesets + versioned internal packages** — machinery for publishing
  we don't do; workspace `*` deps keep everything atomic.
- **Self-hosted CI (Buildkite etc.)** — no advantage at this team size.

## Final Recommendation

Standardize the task vocabulary (`lint / typecheck / test / build` — renamed
in this change), validate env in one package, and build a bottom-heavy test
pyramid on the architecture's pure core: exhaustive unit tests on domains,
generated contract + visual + ATS/parity tests per template from a shared
fixture corpus, and a thin set of Playwright journeys. One GitHub Actions
workflow with turbo remote caching gates every PR; Vercel previews every
branch; `@resfolio/observability` gives all apps the same redacted logging,
Sentry, and PostHog wiring. The foundation's job is to make the quality bar
mechanical — every doc 01–10 promise that can regress has a named check here.

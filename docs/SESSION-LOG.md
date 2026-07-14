# Session Log — Architecture & Phase 1 Foundation

Date: 2026-07-14

A record of the founding engineering session: architecture decisions,
documentation created, Phase 1 implementation, and post-phase cleanup.

---

## 1. Architecture documentation (docs/)

Created `docs/` as the source of truth, with **12 Accepted architecture
documents**, each containing Problem Statement, Proposed Architecture,
Tradeoffs, Future Scalability, Implementation Strategy, Open Questions,
Alternatives Considered, and Final Recommendation:

| #   | Document               | Core decision                                                                                                                                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Profile Engine         | Profile × Document × Template model; versioned Zod schema in `domains/profile`; JSONB storage; draft/publish with `draftRev` optimistic concurrency; ProfileView as the only template contract                      |
| 02  | Resume Rendering       | One React template rendered by Chromium everywhere (browser preview + Playwright `page.pdf()`); Trigger.dev export; content-hash R2 cache; ATS-safe by construction                                                 |
| 03  | Portfolio Rendering    | Templates are React packages in-repo (not separate apps), rendered by one multi-tenant app via a static registry; themes are CSS tokens                                                                             |
| 04  | Deployment             | Single `apps/sites` app; ISR + per-site cache tags invalidated on publish; domains phased: `/p/username` → subdomains → custom CNAME                                                                                |
| 05  | Template SDK           | `defineTemplate` contract (Zod config schema, capabilities, semver); templates are **universal components**; additive-only ProfileView versions                                                                     |
| 06  | API Architecture       | Server Components for reads, Server Actions for mutations, thin adapters over framework-free `domains/*`; no tRPC; REST only when an external consumer exists                                                       |
| 07  | Storage                | Postgres = truth (Drizzle); Redis = expendable cache/locks/rate-limits; R2 = all binaries, content-addressed and immutable                                                                                          |
| 08  | Dashboard UX           | Sidebar + command palette; reusable **split workspace** editor (form left, live preview right); design system extracted to `packages/design`                                                                        |
| 09  | Rendering Pipeline     | **Resolve → Project → Render → Deliver**; all surfaces share Project + Render; deterministic renders keyed by content hash                                                                                          |
| 10  | Auth & Security        | **Better Auth, Google + GitHub social login only** (no passwords); host-only cookies; cookie-free public sites; signed 5-min render tokens; UGC treated as hostile (URL allowlists, CSP, R2-only images)            |
| 11  | Engineering Foundation | Uniform task names; `packages/env` + `process.env` ban; bottom-heavy test pyramid; GitHub Actions + Vercel; observability package                                                                                   |
| 12  | Integrations & Sync    | Connect → Fetch → Normalize → Stage → **Review** → Apply pipeline; connectors declare auth mode (`oauth2/token/public/file`); three-way merge — imports **never** overwrite user edits; LinkedIn = file import only |

Plus **`docs/DEVELOPMENT-PLAN.md`** — 7 phases with exit criteria and a risk
register — and `docs/README.md` index with a deferred-designs list (billing,
account deletion, transactional email, onboarding import, AI enrichment).

## 2. Final architecture review

Declared **implementation-ready** after four documentation-only fixes:

- Resolved the RSC-vs-client-preview contradiction — template renderers are
  **universal components** (doc 05).
- Added draft autosave optimistic concurrency (`draftRev`, doc 01).
- Recorded account deletion/data export and transactional email as deferred
  designs (docs/README.md, doc 10).
- Aligned doc 11 sequencing wording with the development plan.

## 3. Phase 1 — implemented ✅

- **Renamed** `@repo/*` → `@resfolio/*` everywhere.
- **`packages/env`** (`@t3-oss/env-nextjs` wrapper + slice pattern) with an
  ESLint rule banning `process.env` outside it.
- **`packages/design`** — extracted the landing page's Tailwind v4 `@theme`
  tokens, base styles, and `card-surface` classes; `apps/web` visually
  unchanged (verified via compiled CSS).
- **`@resfolio/ui`** — replaced starter components with shadcn-pattern
  `Button` / `Input` / `cn` behind a single public API; the dashboard
  placeholder page uses them.
- **CI** (`.github/workflows/ci.yml`: prettier + `turbo lint typecheck test
build`) and **`docker-compose.dev.yml`** (Postgres 16 + Redis 7).
- Fixed shared tsconfig to `moduleResolution: Bundler`; standardized scripts
  (`typecheck`, `test`, `format:check`).
- All docs/CLAUDE.md files synchronized; full pipeline green (10/10 tasks).

**Known dev-server gotcha:** a `Can't resolve '@resfolio/design'` error in
`next dev` means a stale dev server/cache from before the package existed —
stop dev, `pnpm install`, restart (delete `apps/web/.next` if it persists).

## 4. Onboarding review — applied ✅

- **`apps/app` → `apps/dashboard`** (package name `dashboard`) — folder,
  docs, plan, and port table all updated. Done before Vercel projects exist,
  while the rename was still a folder move.
- **Root README rewritten** (was create-turbo boilerplate);
  `apps/web/README.md` replaced (was create-next-app boilerplate).
- **`design_guidelnes.json` typo fixed**; references consolidated into
  `apps/web/design-refs/{design_guidelines.json, landing-page/, portfolio/}`.
- **`pnpm-workspace.yaml`** now registers `domains/*` and `templates/*`.
- **`engines.node`** bumped to `>=20.9` (Next 16 floor; CI runs Node 22).

## 5. Outstanding / next

**User actions:**

- Create Vercel projects: `web` → root `apps/web`, `dashboard` → root
  `apps/dashboard`; set `TURBO_TOKEN` (secret) and `TURBO_TEAM` (variable)
  for CI remote caching.
- Restart any running dev servers (the dashboard folder moved).
- Nothing committed yet — commit when ready.

**Next: Phase 2** (per `docs/DEVELOPMENT-PLAN.md`) — `packages/database`
(Drizzle + migrations), `packages/auth` (Better Auth: Google + GitHub,
account linking), dashboard shell (sidebar, command palette, settings /
linked accounts), security headers/CSP, auth rate limiting, and
`packages/observability` (Sentry + Pino).

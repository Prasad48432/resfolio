# Session Log 8 — Phase 5 (session 3): sites table, publish, dashboard, SEO, 2nd template

Date: 2026-07-16 · Previous log: [SESSION-LOG-7.md](SESSION-LOG-7.md)

Phase 5 is **product-complete**. Sessions 1–2 built the SDK portfolio contract,
the first template, and the public rendering host (fixture-backed). This session
closed the phase end-to-end: the DB **`sites` table** + `@resfolio/portfolio/server`,
the DB-backed resolve swap + cross-deployment publish invalidation, the
**dashboard portfolio section** (claim → configure → publish → switch), the
**draft-preview iframe**, **platform SEO**, and a **second portfolio template**.
Verified against a production build of `apps/sites` (public route + SEO
surfaces) and the full `turbo lint typecheck test` (40/40).

---

## 1. `sites` table + `@resfolio/portfolio/server` (docs 04/07)

- **`packages/database/src/schema/sites.ts`** + migration `0003_romantic_sinister_six.sql`:
  `sites` (unique `profile_id` + unique `slug`, `template_id`/`template_major`,
  `config`/`view` JSONB, nullable `published_version_id`, `discoverable`). One
  site per profile; `published_version_id` **pins** the immutable
  `profile_versions` snapshot so a cached public page can never show draft state.
- **`./server`** — the only code touching the table. Owner-scoped CRUD
  (`getSiteForOwner`, `createSite`, `updateSite`, `isSlugAvailable`) scoped by
  `userId → profileId`; two unscoped public reads for the host
  (`getSiteForRender(slug)` returns the render descriptor + the pinned Profile
  via the new `@resfolio/profile/server` `getProfileVersionById`;
  `getSiteIdBySlug` is the cheap tag-deriving lookup); `listDiscoverableSites`
  for the sitemap. `publishSite(userId)` pins the profile's current published
  version (throws `ProfileNotPublishedError` if never published) and returns the
  `siteId` — **the app layer owns invalidation**, mirroring profile/document.
- **`./token`** — a portfolio-shaped signed preview token (`node:crypto`),
  parallel to `@resfolio/document/token`; 5 unit tests. The two domains keep
  independent token modules so neither depends on the other.

## 2. DB-backed rendering + cross-deployment invalidation (doc 04)

- **`apps/sites/lib/resolve-site.ts`** now falls through: **fixture** Sites
  (`ada`/`jun`, always resolve, no DB) → the **DB** `sites` table (dynamically
  imported, **gated on `DATABASE_URL`** so the fixture/CI path 404s cleanly
  instead of 500-ing when no DB is configured). The heavy load is wrapped in
  `unstable_cache` tagged by the stable `site:<id>` (a cheap `getSiteIdBySlug`
  derives the tag first, since a slug rename would orphan a slug-based tag).
- **`app/api/revalidate/route.ts`** — `POST { siteId }`, bearer-guarded by the
  shared `PRINT_TOKEN_SECRET`, calls `revalidateTag('site:<id>', { expire: 0 })`
  (Next 16's two-arg signature; `expire:0` = immediate for a webhook). The
  dashboard (a separate deployment) calls this on publish because an in-process
  `revalidateTag` can't reach this app's cache.

## 3. Dashboard portfolio section (docs 03/08)

- **`describeConfigSchema`** (`lib/config-form.ts`, pure + 5 unit tests)
  introspects a template's Zod v4 `configSchema` into field descriptors
  (color / select / boolean / number / text; unknown shapes skipped, not
  guessed). `ConfigFields` renders them — the settings form is **generated from
  the schema**, so a new config option never touches the dashboard.
- **`/portfolio`**: no site → `PortfolioClaim` (slug input with live
  availability via `checkSlugAvailabilityAction`, template radio pick);
  has a site → `PortfolioEditor` (`SplitWorkspace`: settings left, draft-preview
  iframe right). Autosaves config + discoverable; **publish** pins the version +
  calls `/api/revalidate`; **template switch** resets config to the new
  template's defaults and reloads (URLs unaffected — routes are platform-owned).
- Actions in `app/(dashboard)/portfolio/actions.ts` (thin `createAction`
  adapters); slug validated with the domain's `siteSlugSchema` (blocklist),
  config validated with the chosen template's own schema before store.

## 4. Draft-preview route + iframe (docs 08/09)

- **`app/preview/portfolio/[[...slug]]`** verifies the owner's preview token,
  loads their **draft** profile + Site config, and runs the **same**
  `renderPortfolioPage` helper the public route uses (preview == live). Refactor:
  the Render stage moved to `lib/render-portfolio-page.tsx`, shared by both.
  `force-dynamic`, `noindex`, and framed only by the dashboard
  (CSP `frame-ancestors 'self' <DASHBOARD_URL> localhost:3001` in `next.config.ts`).
- The editor re-mints the preview URL after every save (fresh short-TTL token →
  iframe reloads to the just-saved draft, never expires mid-session).

## 5. Platform SEO (doc 04)

- **JSON-LD `Person`** (`lib/portfolio-seo.ts`) built from the ProfileView
  (name, jobTitle, description, image, address, email, `sameAs` = profile links),
  emitted on the home page only; **canonical URLs** + `metadataBase` in
  `generateMetadata`. `SITE_PUBLIC_URL` (optional, shared env) overrides the
  production origin for preview deploys.
- **`app/sitemap.ts`** — every discoverable published site expanded to its
  template's *listable* pages (detail pages omitted); fixtures + DB sites.
  **`app/robots.ts`** — allow `/p/*`, disallow `/render/` + `/api/`, point at
  the sitemap. Non-discoverable sites keep their per-page `noindex`.

## 6. Second template — `@resfolio/template-portfolio-sidebar`

A two-column site (sticky profile sidebar + content) in a dark (`slate`) /
light (`ivory`) sans-serif key. Deliberately a **different config shape**
(`accent`, `sidebarPosition`, `showAvatar`, `density`) to exercise the
schema-driven form, and the **same** `capabilities.pages` + `href` seam to prove
URL-stable switching. 14 render-harness tests (mirrors `portfolio-minimal`,
plus a `sidebarPosition` config assertion). Registered in both the `apps/sites`
render registry and the dashboard config registry.

## 7. Verification

- **Full workspace:** `pnpm turbo lint typecheck test` → **40/40 tasks** green
  (was 37; +the sidebar template's lint/typecheck/test). New unit tests:
  portfolio token (5), dashboard `describeConfigSchema` (5), sidebar render (14).
- **Production build + runtime (fixture source, no DB):** `pnpm --filter sites
  build` compiles all routes (`/p/*`, `/preview/portfolio/*`, `/api/revalidate`,
  `/robots.txt`, `/sitemap.xml`). Against the running prod server: `/p/ada` 200
  with a valid JSON-LD `Person` + `<link rel="canonical">`; `/p/ada/{projects,
  projects/prj-fluxlog,about,resume}` 200; `/p/ada/nope` + `/p/nobody` **404**
  (the no-DB gate — previously 500); `/preview/portfolio` (no token) 404 with
  `noindex` + `frame-ancestors` CSP; `robots.txt` + `sitemap.xml` correct.
- **DB-backed end-to-end (local Tier 3, 2026-07-16):** migration `0003` applied
  to local Docker Postgres; the real flow verified in-product — profile publish →
  portfolio claim (slug `prasadreddy03`) → **site publish** → the site served
  live at `http://localhost:3002/p/<slug>` via the DB source. (Confirmed the
  by-design gate: a claimed-but-unpublished site 404s until "Publish site" is
  clicked — `getSiteIdBySlug` returns null while `published_version_id` is null.)
  Cross-deployment ISR tag-invalidation on a **Vercel** preview deploy remains
  the one account-gated proof.

## 8. Docs synchronized

Root `CLAUDE.md` (portfolio domain `./server`+`./token`, sidebar template,
apps/sites surfaces); `domains/portfolio/CLAUDE.md` (`./server` + `./token`
built); `apps/sites/CLAUDE.md` (preview route, SEO, revalidate endpoint, DB gate);
`apps/dashboard/CLAUDE.md` (portfolio section); new
`templates/portfolio-sidebar/CLAUDE.md`; `DEVELOPMENT-PLAN.md` Phase 5 →
product-complete with the exit criteria annotated.

## 9. Next — what remains (account-gated)

- **Verify ISR tag-invalidation on a Vercel preview deploy** — the publish flow
  now exists (pin + `/api/revalidate`); the doc-04 risk is proving it across
  real deployments. Set the dashboard's `SITES_URL` + `PRINT_TOKEN_SECRET` and
  `apps/sites`'s `DATABASE_URL`/`DASHBOARD_URL`, publish, watch the page update.
- **Run migration `0003`** against the managed Postgres (via `db:migrate`, the
  same deploy step as prior phases).
- Carried from before: OAuth apps + Vercel env, Sentry source-maps, R2 +
  Trigger.dev (cloud PDF), and `resfolio.site` for subdomains (V1.x only).
- A dashboard **portfolio e2e** (claim → configure → publish) would round out
  coverage — deferred (needs the DB + auth-mock harness the resume e2e uses).

## 10. How to run / test what shipped

```bash
pnpm --filter @resfolio/portfolio test                   # domain: slug, route, token (15)
pnpm --filter @resfolio/template-portfolio-sidebar test  # 14 render tests
pnpm --filter dashboard test                             # incl. describeConfigSchema (5)
pnpm turbo lint typecheck test                           # 40/40 tasks

# public portfolio + SEO (fixture-backed, no DB):
PRINT_TOKEN_SECRET=<≥16 chars> pnpm --filter sites build && pnpm --filter sites start
#   /p/ada · /p/ada/projects · /robots.txt · /sitemap.xml ; /p/nobody → 404
```

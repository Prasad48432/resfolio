# Session Log 7 — Phase 5 (session 2): public portfolio rendering host

Date: 2026-07-15 · Previous log: [SESSION-LOG-6.md](SESSION-LOG-6.md)

Phase 5 continues. Session 1 built the SDK `kind: "portfolio"` contract and the
first portfolio template. **This session made it public**: `apps/sites` now
serves `resfolio.me/p/<username>` end-to-end through the shared rendering
pipeline — a real, indexable, ISR-cached portfolio site. It also created the
`@resfolio/portfolio` domain (pure root). The DB `sites` table + publish flow,
the dashboard portfolio section, the draft-preview iframe, full SEO, and the
second template remain.

---

## 1. `@resfolio/portfolio` domain — pure root (docs 03/04)

New `domains/portfolio` package, mirroring the profile/document layering, root
only this session:

- **`schema.ts`** — `siteSlugSchema` (3–32 chars, lowercase, single internal
  hyphens, DNS-label-safe because the same slug becomes a `*.resfolio.site`
  subdomain later) + the `RESERVED_SLUGS` blocklist / `isReservedSlug` (doc 04's
  open question, resolved: our route/app namespace, infra subdomains,
  support/legal words). `SiteRecord` type (a Site is `Profile × (template +
config)`; `config`/`view` opaque; `publishedVersionId` pins the version so a
  cached page can never show draft state).
- **`routing.ts`** — `resolvePortfolioRoute(segments)`, the **platform route
  table** (doc 04): URL segments → `{ page, params }`, total, `null` for unknown
  paths. Routes are platform-owned so URLs stay stable across template switches.
- **10 unit tests** (slug accept/reject + normalization + reserved; route-table
  index/detail/404). The `./server` surface (the `sites` table) is deferred to
  the publish slice.
- tsconfig extends `react-library` (jsx on) because the type-only
  `PortfolioPageKind` import pulls the SDK's `.tsx` into the module graph.

## 2. `apps/sites` — the public portfolio route (docs 03/04/09)

- **`app/p/[username]/[[...slug]]/page.tsx`** — one catch-all: resolve Site →
  match route → dispatch to the template's page → render. Server Component.
  `generateMetadata` builds title/description from the ProfileView and honors
  the site's `discoverable` toggle. Platform refuses a template whose
  `compat.profileView` it can't build; a route the template doesn't declare in
  `capabilities.pages` 404s (doc 04).
- **`lib/resolve-site.ts`** — Resolve → Project for public pages: `<username>` →
  a Site descriptor → published profile snapshot → the pure `buildProfileView`
  (the same function the resume path and dashboard preview run). Two sources
  mirroring the resume route: **`fixture`** (dev/CI, no DB — `ada`/`jun` map to
  the fixture Sites) and **`version`** (`getPublishedProfile` via a **dynamic
  import**, so the fixture path needs no database). The whole load is wrapped in
  `unstable_cache` tagged `site:<id>` with a 24h fallback `revalidate` — the
  doc-04 cache shape (steady-state cost ≈ CDN; publish will `revalidateTag`).
  The DB **Site** lookup (`@resfolio/portfolio/server`) is a marked seam.
- **`lib/portfolio-templates.ts`** — the portfolio registry (static map, no
  runtime `import()`), mirroring `lib/templates.ts`; config erased to `unknown`,
  re-validated at render with the template's own schema.
- **Indexability posture split** — the app dropped its global `robots:
index:false`. `/p/*` is indexable (its own metadata + discoverable toggle);
  `/render/*` keeps `noindex` (route metadata + the existing `X-Robots-Tag`
  header). The on-screen paper backdrop moved from `globals.css` to a scoped
  `app/render/layout.tsx` so it never bands the full-bleed portfolio; `globals`
  is now a bare reset.
- **Fonts** — the layout adds **Instrument Serif** (`--font-instrument-serif` →
  portfolio templates' `--rf-font-display`) alongside Manrope, both self-hosted
  by `next/font`.

## 3. Verification

- **End-to-end, real host, real fonts:** ran `apps/sites` dev and screenshotted
  the public routes via Playwright. `/p/ada` (hero with self-hosted Instrument
  Serif display + Manrope body, accent headline, socials, featured project),
  `/p/ada/projects`, `/p/ada/projects/prj-fluxlog` (resolved by slug, back link,
  tags, highlights, inline links), `/p/ada/about` — all **200**. `/p/ada/nope`
  (unknown route) and `/p/nobody` (unknown username) both **404**. This is the
  full pipeline: Resolve → Project → Render → Deliver (public, cached).
- **Full workspace:** `pnpm turbo lint typecheck test` → **37/37 tasks** green
  (was 34; +the `@resfolio/portfolio` lint/typecheck/test).
- **Production build:** `pnpm --filter sites build` compiles; the route table
  shows `/p/[username]/[[...slug]]` as `ƒ (Dynamic)` — dynamic render + the
  `unstable_cache`/tag layer = doc-04's "ISR + tags" economics.

## 4. Docs synchronized

- New **`domains/portfolio/CLAUDE.md`**; updated **`apps/sites/CLAUDE.md`**
  (Phase-5 status, the two-posture route rule, the public route in the pipeline,
  the scoped render backdrop, the display font) and **root `CLAUDE.md`** (added
  `@resfolio/portfolio`; apps/sites now serves public portfolios).
- **`DEVELOPMENT-PLAN.md`** Phase 5 — public rendering marked ✅,
  `domains/portfolio` 🟡 (root done, server + dashboard remain); status block
  updated.

## 5. Next — resume Phase 5 here

The public host renders; what remains is making it **real data** and
**editable**:

- **`sites` table + `@resfolio/portfolio/server`** (docs 04/07): the Drizzle
  `sites` table + migration (`profileId`, unique `slug`, `templateId`/
  `templateMajor`, `config` + `view` JSONB, `publishedVersionId`,
  `discoverable`), owner-scoped CRUD, the one unscoped `getSiteForRender(slug)`,
  and `publishSite` → `revalidateTag('site:<id>')`. Then swap
  `resolve-site.ts`'s fixture map for the DB lookup (keep the fixture source for
  CI), and the `version` source pins `publishedVersionId`.
- **Dashboard portfolio section** (doc 03): slug claim (using
  `siteSlugSchema` + the blocklist, with a uniqueness check), template pick, the
  **schema-driven settings form** reading the template's `configSchema`, and the
  publish button (calls `publishSite`, which invalidates the tag). This closes
  the doc-04 exit criterion (publish → public URL updates via tag invalidation).
- **Draft-preview route + iframe** (doc 08): a signed-token preview render in
  `apps/sites` + the portfolio preview iframe in the editor (CSP
  frame-ancestors carve-out). Portfolio pages are universal RSCs, so the preview
  renders the real template.
- **Full platform SEO** (doc 04): JSON-LD (`Person`), per-site
  `sitemap.xml`/`robots.txt` honoring `discoverable`, canonical URLs.
- **Second template** → unlocks the CI visual-snapshot harness (doc 05 step 4).

## 6. How to run / test what shipped

No database needed — the fixture Sites (`ada`, `jun`) drive the public route.

```bash
pnpm --filter @resfolio/portfolio test                  # 10 domain tests
pnpm turbo lint typecheck test                          # 37/37 tasks

# view a live public portfolio (fixture-backed):
PRINT_TOKEN_SECRET=<≥16 chars> pnpm --filter sites dev  # then open:
#   http://localhost:3002/p/ada           (home)
#   http://localhost:3002/p/ada/projects  · /projects/prj-fluxlog · /about · /resume
```

## 7. Outstanding (carried, need account access)

Unchanged from SESSION-LOG-6: OAuth apps + Vercel env, managed Postgres host,
preview-deploy sign-in verification, Sentry source-map upload, R2 + Trigger.dev
credentials (cloud PDF), and — Phase-5-specific — whether `resfolio.site` is
acquired for subdomains (doc 04, only needed at V1.x; the `/p/<username>` path
routing this phase targets needs none of it). ISR tag-invalidation should be
verified on a Vercel preview deploy once the publish flow exists (doc 04 risk).

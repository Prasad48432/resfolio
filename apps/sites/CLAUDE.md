# apps/sites — the rendering host

The single server-side rendering host for every non-dashboard surface
(docs/architecture/09-rendering-pipeline.md). Parity means "rendered by the
same app, bundle, fonts, and CSS," so public pages, draft previews, print
routes, and screenshots all live here. Port **3002** (web=3000, dashboard=3001).

**Status (Phase 5, product-complete):** the **resume print route** (private,
token-guarded) + the local PDF spike; the **public portfolio route**
(`/p/[username]/[[...slug]]`, ISR-cached, indexable, DB- **or** fixture-backed);
the **draft-preview route** (`/preview/portfolio/[[...slug]]`, private,
token-guarded, iframed by the dashboard); platform **SEO** (`app/sitemap.ts`,
`app/robots.ts`, JSON-LD on the portfolio home); and the on-demand
**revalidation endpoint** (`app/api/revalidate`) the dashboard calls on publish.
The R2 + Trigger.dev delivery adapters are later work.

## The pipeline, as built here

`Resolve → Project → Render → Deliver` (doc 09). Surfaces differ **only** in
Resolve and Deliver; Project and Render are shared code.

- **Resolve** (`lib/resolve.ts`) — load the profile snapshot (`source`/`ref`)
  and the render spec (`document`: an **inline** spec carried by the token, or
  a **stored** `documents` id looked up via `@resfolio/document/server`). The
  DB-backed sources (`draft` / `version`) and the stored lookup are
  **dynamically imported**, so the `fixture` + inline path (dev/CI/export
  script) needs no database or `DATABASE_URL`.
- **Project** — `buildProfileView` from `@resfolio/profile`, the _same pure
  function_ the dashboard preview runs client-side. Do not re-implement it.
- **Render** — the template's `document` from `@resfolio/template-sdk`, via
  the `lib/templates.ts` registry. The host is generic over any registered
  resume template; config is re-validated with the template's own schema.
- **Deliver** — two surfaces sharing Resolve/Project/Render:
  - `app/render/resume/[documentId]` — private HTML/PDF (token-guarded, never
    cached); the PDF path is `scripts/export-pdf.mts` (Playwright →
    `LocalFsExportStore`).
  - `app/p/[username]/[[...slug]]` — the **public portfolio route** (doc
    03/04). `lib/resolve-site.ts` resolves `<username>` → **fixture** Sites
    (`ada`/`jun`, dev/CI, no DB) or the **DB** `sites` table
    (`@resfolio/portfolio/server`, dynamically imported, gated on `DATABASE_URL`
    so the fixture path 404s cleanly with no DB); loads the published
    ProfileView cached via `unstable_cache` tagged `site:<id>` (24h fallback
    `revalidate`). `resolvePortfolioRoute` maps the catch-all segments to a page
    kind + params; `lib/portfolio-templates.ts` (registry of **both** portfolio
    templates) dispatches; declared `capabilities.pages` gate which routes 404.
    `generateMetadata` sets canonical + honors `discoverable`; the home page
    emits a JSON-LD `Person`. The shared Render stage is `lib/render-portfolio-page.tsx`.
  - `app/preview/portfolio/[[...slug]]` — the private **draft-preview route**.
    Verifies the owner's `@resfolio/portfolio/token` preview token, loads their
    **draft** profile + Site config, and runs the **same** `renderPortfolioPage`
    as the public route (so preview == live). `force-dynamic`, `noindex`, framed
    only by the dashboard (`frame-ancestors` in `next.config.ts`).
  - `app/api/revalidate` — `POST { siteId }`, bearer-guarded by the shared
    `PRINT_TOKEN_SECRET`; drops the `site:<id>` tag. The dashboard (a separate
    deployment) calls this on publish since an in-process `revalidateTag` can't
    reach this app's cache (doc 04).
  - `app/sitemap.ts` / `app/robots.ts` — the platform SEO surface: every
    discoverable published site expanded to its template's listable pages;
    `robots` allows `/p/*`, disallows `/render/` + `/api/`.

## Rules

- **Two route postures.** `/render/*` is **private**: token-guarded (the
  shared `@resfolio/document/token`, HMAC + short TTL — the dashboard mints,
  this app verifies), `noindex` (route metadata + `X-Robots-Tag` in
  `next.config.ts`), `dynamic = "force-dynamic"` — never cached. `/p/*` is
  **public**: indexable (its own `generateMetadata`, honoring the site's
  `discoverable` toggle), ISR-cached + `site:<id>`-tagged (doc 04). The app has
  **no global robots directive** — each surface declares its own.
- **No marketing theme.** This app carries no cream/`@resfolio/design` theme.
  Templates ship their own self-contained styles; `app/globals.css` is only a
  reset. The on-screen paper backdrop for the resume preview lives in
  `app/render/layout.tsx` (scoped there so it never bleeds onto full-bleed
  portfolio pages; print stays pure white).
- **Fonts are self-hosted** by `next/font` (`display: "block"`) and exposed as
  `--font-manrope` (→ templates' `--rf-font-body`) and
  `--font-instrument-serif` (→ portfolio templates' `--rf-font-display`). The
  same font files back preview, print, and PDF — that's where pixel parity
  comes from (doc 02). Never rely on system fonts in a template.
- **Determinism** (doc 09): Render must not consult the clock, server locale,
  or randomness — those are client islands layered on top, outside the cached
  render. Content identity is the render hash (`lib/render-key.ts`).
- **The cloud seam.** `ExportStore` (`lib/export-store.ts`) and the token
  signer are interfaces; today `LocalFsExportStore` + a stateless HMAC token.
  Wiring R2 + Trigger.dev + Redis nonces later swaps implementations behind
  these seams — no route or template changes. (4E is done: the token carries a
  stored `documents` id and the route looks up config/view via
  `@resfolio/document/server`, keeping `source`/`ref`.)

## Local verification

```bash
# terminal 1 — dev server (secret must match the export script)
PRINT_TOKEN_SECRET=<≥16 chars> pnpm --filter sites dev
# terminal 2
PRINT_TOKEN_SECRET=<same> pnpm --filter sites export:pdf   # → apps/sites/out/<hash>.pdf
PRINT_TOKEN_SECRET=<same> pnpm --filter sites export:pdf   # → cache hit, no Chromium boot
PRINT_TOKEN_SECRET=<same> pnpm --filter sites check:ats    # headings extractable, in order
```

Requires Next.js docs discipline: read `node_modules/next/dist/docs/` before
Next-specific work (see the repo's AGENTS.md convention).

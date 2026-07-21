# apps/sites — the rendering host

The single server-side rendering host for every non-dashboard surface
(docs/architecture/09-rendering-pipeline.md). Parity means "rendered by the
same app, bundle, fonts, and CSS," so public pages, draft previews, print
routes, and screenshots all live here. Port **3002** (web=3000, dashboard=3001).

**Status (Phase 5 + the 4G resume rebuild):** the **public resume route**
(`/render/resume/[documentId]`, no token — gated by the document's own
`visibility`), its private `/draft` sibling and `POST /api/export/resume/[id]`
(the real PDF path); the dev-only fixture route; the **public portfolio route**
(`/p/[username]/[[...slug]]`, ISR-cached, indexable, DB- **or** fixture-backed);
platform **SEO** (`app/sitemap.ts`,
`app/robots.ts`, JSON-LD on the portfolio home); and the on-demand
**revalidation endpoint** (`app/api/revalidate`) the dashboard calls on publish.
The R2 + Trigger.dev delivery adapters are later work.

**This app has no sessions.** That is deliberate, and it shapes everything
below: ownership is verified in the dashboard, which then calls here with the
`RENDER_SECRET` bearer. Nothing here trusts a user-supplied capability.

## The pipeline, as built here

`Resolve → Project → Render → Deliver` (doc 09). Surfaces differ **only** in
Resolve and Deliver; Project and Render are shared code.

- **Resolve** (`lib/resolve.ts`) — `resolveResumeRender(documentId, snapshot)`
  looks the document up via `@resfolio/document/server` and loads the profile
  snapshot: `published` (what the public URL always shows) or `draft` (the
  owner's own export, matching the editor preview). It returns a **typed
  result** — `ok | not-found | private | unpublished` — rather than
  value-or-throw, because "private" and "unpublished" are ordinary outcomes a
  caller must render, and making them variants means the compiler asks. The
  DB-backed path is **dynamically imported**, so `resolveFixtureRender`
  (dev/CI/the ats-check script) needs no database or `DATABASE_URL`.
  Visibility gates the **published** path only: exporting a _private_ resume is
  the whole point of marking one private.
- **Project** — `buildProfileView` from `@resfolio/profile`, the _same pure
  function_ the dashboard preview runs client-side. Do not re-implement it.
- **Render** — `lib/render-resume.tsx` (`renderResumeDocument`) and
  `lib/render-portfolio-page.tsx`. Shared by every surface so they cannot
  drift; the host is generic over any registered template and re-validates
  config with the template's own schema. An unregistered template or a rejected
  config throws `UnrenderableDocumentError` → the caller 404s (the _document_
  is at fault); a ProfileView major mismatch throws `TemplateCompatError` → a
  real 500 (the _deployment_ is at fault).
- **Deliver** — the surfaces sharing Resolve/Project/Render:
  - `app/render/resume/[documentId]` — the **public resume**. No token: the
    row's `visibility` decides. Renders the **published** version.
    `force-dynamic` — see "Two route postures" below for why it is not ISR.
    Private renders a notice at **200**, not a 404: the URL exists, and 404ing
    would leak "no such resume" vs "not yours".
  - `app/render/resume/[documentId]/draft` — the **private draft render**,
    `RENDER_SECRET`-bearer only, `force-dynamic`. This is what Playwright loads
    at export, so the owner's PDF matches the editor preview beside it.
  - `app/render/resume/fixture/[key]` — **dev/CI only** (404s in production).
    `export:pdf` and `check:ats` must run with no DB, no user and no account;
    they used to reach the print route with an inline token payload, and
    removing the token took that vehicle away. The fixture path gets its own
    honest route rather than the product path growing a dev backdoor.
  - `app/api/export/resume/[documentId]` — **PDF**, bearer-guarded. Cache-check
    → `chromium.launch()` → `page.pdf()` → `ExportStore`, all in `lib/pdf.ts`
    (shared with `scripts/export-pdf.mts`, so product and CI cannot drift).
    Playwright is imported **dynamically** and stays a devDependency: doc 02
    puts PDFs in a Trigger.dev task, not a serverless route, so a deployment
    without it answers **501** instead of bundling ~50MB of Chromium. This
    route is that task's body, reachable today.
  - `app/p/[username]/[[...slug]]` — the **public portfolio route** (doc
    03/04). `lib/resolve-site.ts` resolves `<username>` → **fixture** Sites
    (`ada`/`jun`, dev/CI, no DB) or the **DB** `sites` table
    (`@resfolio/portfolio/server`, dynamically imported, gated on `DATABASE_URL`
    so the fixture path 404s cleanly with no DB); loads the published
    ProfileView cached via `unstable_cache` tagged `site:<id>` (24h fallback
    `revalidate`). `resolvePortfolioRoute` maps the catch-all segments to a page
    kind + params; `lib/portfolio-templates.ts` (the portfolio template registry
    — `dark-anime` today) dispatches; declared `capabilities.pages` gate
    which routes 404.
    `generateMetadata` sets canonical + honors `discoverable`; the home page
    emits a JSON-LD `Person`. The shared Render stage is `lib/render-portfolio-page.tsx`.
    **The `blogPost` route is the one place Resolve differs per page kind**:
    `loadPost(profileId, slug)` runs only there, because a post body is
    unbounded prose and folding every post into the portfolio load would put
    the whole blog in the cache entry behind every page. It returns a
    `PostView`, and the Render stage 404s a `blogPost` route with no post — the
    template's own "Post not found" body is robustness, not the behaviour.
    A post also gets **its own metadata** (title, description, cover,
    `og:type=article`); inheriting the profile's would give every post on a
    site an identical title and social card.
    **Two cache tags, not one.** A portfolio render depends on the site's
    pinned profile version *and* on the owner's posts, which change on
    different events — so the caches carry `site:<id>` **and**
    `blog:<profileId>`, and `/api/revalidate` accepts `{ siteId }`,
    `{ profileId }`, or both. Tagging only the site left a newly published post
    invisible (and an unpublished one readable) for the full 24h fallback.
  - ~~`app/preview/portfolio/[[...slug]]`~~ — **removed 2026-07-18.** The
    dashboard iframed this to show a live draft, which meant re-rendering the
    entire portfolio application after every save — a cost that grows with each
    new template, paid to answer a question a screenshot answers as well. The
    dashboard now shows a placeholder pane; a cheaper preview replaces it later.
    Nothing frames this app any more, so the `frame-ancestors` carve-out and
    `DASHBOARD_URL` went with it. The signing primitive
    (`@resfolio/portfolio/token`) is parked, not deleted.
  - `app/api/revalidate` — `POST { siteId }`, bearer-guarded by the shared
    `RENDER_SECRET`; drops the `site:<id>` tag. The dashboard (a separate
    deployment) calls this on publish since an in-process `revalidateTag` can't
    reach this app's cache (doc 04).
  - `app/api/github` — `POST { username }`, **public** (no bearer): the
    `dark-anime` template's activity-graph island calls it same-origin so the
    `GITHUB_TOKEN` never reaches the browser. Adapted from the reference's proxy
    but it takes a validated username and builds the GraphQL query server-side
    (the client can't borrow the token to run arbitrary queries), and soft
    failures — no token, upstream error — return `200 { calendar: null }` so the
    optional graph degrades to a note rather than logging a 500. `GITHUB_TOKEN`
    is optional (shared with the imports rate-limit lever); absent, the graph
    simply reports no data.
  - `app/sitemap.ts` / `app/robots.ts` — the platform SEO surface: every
    discoverable published site expanded to its template's listable pages;
    `robots` allows `/p/*`, disallows `/render/` + `/api/`.

## Rules

- **Three route postures, not two** (doc 09). The old rule — "`/p/*` public,
  everything else token-guarded" — died when resumes got permanent URLs.
  - **Public + indexable**: `/p/*`. Its own `generateMetadata` honoring
    `discoverable`; ISR + `site:<id>` tags (doc 04).
  - **Public + unlisted**: `/render/resume/[documentId]`. Guarded by the row's
    `visibility`, **noindex** (`X-Robots-Tag` in `next.config.ts` +
    `robots.txt`), not cached. Readable-by-link ≠ crawlable: a resume carries
    an email and a phone number and has no `discoverable` toggle to opt in
    with. **It is deliberately not ISR** — its render also depends on the
    document's live `config`/`view`/`visibility`, so it has two invalidation
    triggers (publish _and_ any editor edit) and `/api/revalidate` only knows
    `site:<id>`. Caching it before that plumbing exists serves stale content,
    or a private resume that stays readable. Correctness first.
  - **Private**: `/render/resume/*/draft` + `/api/export/*` + `/api/revalidate`
    (`RENDER_SECRET` bearer — server-to-server, never user-facing). All
    `force-dynamic`, all noindex. **Every private surface here is now
    server-to-server**; nothing is loaded by a user's browser, which is why no
    signed URL token is in play.
  - The app has **no global robots directive** — each surface declares its own.
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
- **Every renderKey input must actually identify content.** The key takes a
  single `revision` — `draft:<draftRev>` | `version:<id>` | `fixture:<key>` —
  built in `lib/resolve.ts`, never assembled by callers. It replaced a
  `source` + `ref` pair where `ref` was the owner's _userId_ for a draft: a
  value that never changed when the draft did, so editing a profile and
  re-exporting silently served the old PDF. Invisible while only the fixture
  path (immutable) was exercised; a live bug the moment export ran on a draft.
  A stable-looking id is not a content identity.
- **The cloud seam.** `ExportStore` (`lib/export-store.ts`) and `lib/pdf.ts`
  are the interfaces; today `LocalFsExportStore` + a dynamically-imported
  Playwright. Wiring R2 + Trigger.dev later swaps implementations behind these
  seams — no route or template changes.

## Local verification

The fixture path needs **no secret and no database** — that is the point of it.

```bash
# terminal 1
pnpm --filter sites dev
# terminal 2
pnpm --filter sites export:pdf   # → apps/sites/out/<hash>.pdf
pnpm --filter sites export:pdf   # → cache hit, no Chromium boot
pnpm --filter sites check:ats    # headings extractable, in reading order
```

The product path needs both (Docker Postgres on host **5433**):

```bash
RENDER_SECRET=<≥16 chars> DATABASE_URL=<…> pnpm --filter sites dev

curl -i localhost:3002/render/resume/<id>            # public: 200, or the private/unpublished notice
curl -i -X POST -H "authorization: Bearer <secret>" \
     localhost:3002/api/export/resume/<id>           # → application/pdf; x-render-cache: miss|hit
```

Worth re-checking after any change to Resolve or the render key: edit the
profile draft, export again, and confirm `x-render-key` **changes** and the
bytes differ. That regression is silent.

Requires Next.js docs discipline: read `node_modules/next/dist/docs/` before
Next-specific work (see the repo's AGENTS.md convention).

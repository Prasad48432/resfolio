# @resfolio/template-portfolio-minimal — the first portfolio template

The first `kind: "portfolio"` template (docs/architecture/03-portfolio-rendering.md),
and the proof that the Template SDK's portfolio contract holds. A quiet,
editorial site — serif display type, generous whitespace, project-forward, in
a dark (`midnight`) or light (`paper`) key. Presentation only: it consumes a
projected `ProfileView` and knows nothing about storage, routing internals, or
delivery.

## Contract (doc 05)

- Depends on `@resfolio/template-sdk` and **nothing else platform-side** —
  never `domains/*`. All content types are derived from `ProfileView`.
- `defineTemplate({ kind: "portfolio", … })` in `src/index.ts` validates and
  freezes the definition at load. Declares `capabilities.pages`:
  `home, projects, projectDetail, about, resume` — each with a renderer in the
  `pages` map (the SDK enforces the pairing; `home` is mandatory). It does
  **not** declare `blog`/`blogPost`, so the platform routes around them.
- Page renderers are **universal RSCs** (no `"use client"`, no server-only
  APIs), so they render on `apps/sites` and in the dashboard draft-preview
  iframe alike. Motion/interactivity, if ever added, goes in client islands
  layered on top — the layout must never require client JS.

## Structure

- `config.ts` — the template's Zod presentation config. **Content/visibility
  only** (avatar toggle, featured-project count) — the template is opinionated
  and owns all styling (color, type, layout), so a site stays on-brand by
  default. The dashboard builds the settings form from this schema — new
  options never touch the dashboard (doc 03).
- `theme.ts` — two `--rf-*` token presets (`midnight`, `paper`). Tokens are
  fixed by the template (nothing user-recolorable — no `customizableTokens`).
  Light/dark is a token dimension, not a separate template.
- `styles.ts` — one self-contained stylesheet emitted by the shell, **every
  rule scoped under `.rf-site`** (bare element selectors via `:where()` at
  zero specificity) so it never leaks when rendered in-browser. Responsive
  web units — this is a website, not a paginated document.
- `shared.tsx` — the `href(basePath, page, slug?)` platform-URL helper (the
  single routing seam; project slugs are the item's **stable id**, never the
  mutable name), ProfileView section accessors, `Shell` (nav + footer),
  `Socials`, `ProjectCard`.
- `sections.tsx` — reusable section renderers (experience / education / skills
  / writing) shared by About and Résumé.
- `pages/` — one file per declared page kind.

## Links & routing

The template never knows the username or mount point. It builds every
inter-page link from the `basePath` the platform passes in `PortfolioPageProps`
(doc 04: routes are platform-owned so URLs stay stable across template
switches). Keep all URL construction in `href()`.

## Tests

`src/render.test.tsx` is the template contract harness (doc 05 impl step 4):
it renders **every declared page** against the shared `@resfolio/fixtures`
ProfileViews (`renderToStaticMarkup`, node env) and asserts real content
survives, links are platform-shaped, the resolved theme (incl. the
customizable override) reaches the root, rich text renders (no raw markdown or
HTML), and output is deterministic. The CI visual-snapshot layer grows from
this seed when the second portfolio template lands.

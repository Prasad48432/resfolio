# @resfolio/template-portfolio-sidebar — the second portfolio template

The second `kind: "portfolio"` template (docs/architecture/03-portfolio-rendering.md),
and the proof that the Template SDK's portfolio contract generalizes beyond one
design. A two-column site — a **sticky profile sidebar** (brand, avatar, nav,
socials) beside a scrolling content column — in a dark (`slate`) or light
(`ivory`) sans-serif key. Presentation only: it consumes a projected
`ProfileView` and knows nothing about storage, routing internals, or delivery.

## Why it exists

Two templates is where the abstractions get tested (doc 05, the DEVELOPMENT-PLAN
Phase-5 risk register: "SDK contract feeling wrong with only one template").
This template proves:

- The `apps/sites` + dashboard **registries are generic** — adding a template is
  data, not code changes to the host.
- **Config is per-template + content-only.** Its config schema (`showAvatar`)
  exposes content/visibility, never styling — the two-column layout, sidebar
  side (left), density (comfortable), and colors are fixed template choices, so
  every published site stays on-brand. The dashboard's schema-driven settings
  form renders whatever the schema declares with no changes.
- **Template switch preserves URLs** (doc 04). It declares the **same**
  `capabilities.pages` and builds links with the **same** `href` seam, so
  switching between the two never breaks a URL. `render.test.tsx` asserts the
  page set explicitly.

## Contract (doc 05)

- Depends on `@resfolio/template-sdk` and **nothing else platform-side** — never
  `domains/*`, never the other template. All content types derive from
  `ProfileView`.
- `defineTemplate({ kind: "portfolio", … })` validates + freezes at load.
  Declares `capabilities.pages`: `home, projects, projectDetail, about, resume`.
- Page renderers are **universal RSCs** (no `"use client"`, no server-only
  APIs), so they render on `apps/sites` and in the dashboard draft-preview
  iframe alike.

## Structure

Mirrors `portfolio-minimal`: `config.ts` (Zod presentation config — content
only), `theme.ts` (two `--rf-*` presets, all fixed — no `customizableTokens`),
`styles.ts` (one `.rf-site`-scoped self-contained sheet — the two-column shell;
responsive collapse to single column), `shared.tsx` (`href` routing seam + the
sidebar `Shell` + `Socials`/`ProjectCard`), `sections.tsx` (experience/education/
skills/writing), `pages/` (one file per declared page). The `Shell` reads
`config.showAvatar`; sidebar side and density are fixed literals in the markup.

## Tests

`src/render.test.tsx` is the same contract harness as `portfolio-minimal`:
render every declared page against the shared `@resfolio/fixtures` ProfileViews,
assert real content survives, links are platform-shaped, the layout is fixed
(sidebar pinned left), the resolved theme reaches the root, and output is
deterministic with no raw HTML leak. Together the two harnesses seed the CI
visual-snapshot layer.

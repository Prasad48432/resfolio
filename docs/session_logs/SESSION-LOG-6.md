# Session Log 6 — Phase 5 (session 1): SDK portfolio kind + first portfolio template

Date: 2026-07-15 · Previous log: [SESSION-LOG-5.md](SESSION-LOG-5.md)

Phase 5 (portfolio) is **started**. This session built the foundation the doc
03/05 implementation sequence opens with: the Template SDK's `kind:
"portfolio"` contract and a real portfolio template that proves it, both
verified locally. The rest of Phase 5 — the public `apps/sites` rendering
(catch-all route, Site resolution, ISR/tags), the `sites` table +
`domains/portfolio`, the dashboard portfolio section, the draft-preview iframe,
platform SEO, and the second template — is sequenced for the next sessions.

Nothing here is user-visible yet (no public route), by design: the SDK
contract and the template must exist before the host that dispatches to them.

---

## 1. SDK extended for `kind: "portfolio"` (doc 05 impl step 3)

The `@resfolio/template-sdk` discriminated union gained a second kind without
reshaping the resume surface:

- **`types.ts`** — `PortfolioTemplateDefinition` (a `pages` renderer map, not a
  single `document`), `PortfolioCapabilities` (`{ pages }`),
  `PortfolioPageRenderer`, and `PortfolioPageProps`. `PORTFOLIO_PAGE_KINDS`
  (`home, projects, projectDetail, about, resume, blog, blogPost`) is the
  platform route table (doc 04); templates declare a subset via
  `capabilities.pages`.
- **`PortfolioPageProps`** carries the shared `{ view, config, theme }` **plus**
  two platform-owned routing inputs: `params` (matched route params, e.g.
  `{ slug }`) and `basePath` (the site root, e.g. `/p/ada`, the template
  prefixes onto inter-page links). This is the one deliberate extension beyond
  the doc's `{ view, config, theme }` — necessary because detail pages need
  _which_ item and every page needs to build stable links without hard-coding a
  username. Recorded in doc 05.
- **`define-template.ts`** — `defineTemplate` is now overloaded per kind; the
  meta validation is a `z.discriminatedUnion("kind", …)` so each kind's
  `capabilities` shape is checked precisely. Portfolio-specific enforcement:
  `home` is mandatory, every declared page has a function renderer, and a
  renderer for an **undeclared** page is rejected (a definition mistake).
- **`theme.ts`** — `resolveTheme` is now kind-agnostic (takes a structural
  `Pick` of `{ id, themes, customizableTokens }`), so both kinds share it.
- **Tests:** +5 portfolio cases in `define-template.test.ts` (accept/freeze,
  missing-home, declared-page-without-renderer, renderer-for-undeclared-page,
  empty-pages). **35 SDK tests** total, green.

## 2. First portfolio template: `@resfolio/template-portfolio-minimal`

`templates/portfolio-minimal` — a quiet editorial site (serif display type,
generous whitespace, project-forward) in a dark (`midnight`) or light
(`paper`) key, porting the visual language of
`apps/web/design-refs/portfolio/`.

- **Pages** (universal RSCs, zero required client JS): `home` (hero from
  `basics` + actions + socials + featured-project grid), `projects` (full
  grid), `projectDetail` (resolved by `params.slug` = the item's **stable id**,
  never the mutable name; graceful not-found body), `about` (summary +
  experience + writing), `resume` (on-site résumé view: experience, education,
  skills — distinct from the downloadable PDF the resume template produces).
- **Structure:** `config.ts` (Zod presentation config — accent, hero layout,
  avatar toggle, featured count; the dashboard settings form reads this),
  `theme.ts` (two `--rf-*` presets, `--rf-accent` customizable),
  `styles.ts` (one self-contained sheet, **every rule scoped under `.rf-site`**
  via `:where()` at zero specificity so it never leaks in-browser),
  `shared.tsx` (the `href(basePath, page, slug?)` routing seam, section
  accessors, `Shell` nav/footer, `Socials`, `ProjectCard`), `sections.tsx`
  (experience/education/skills/writing renderers shared by About + Résumé).
- Imports `@resfolio/template-sdk` and nothing else platform-side; all content
  types derived from `ProfileView`.

## 3. Verification

- **Render harness** (`src/render.test.tsx`, doc 05 impl step 4 seed): renders
  **every declared page** against the shared `@resfolio/fixtures` ProfileViews
  (Ada full / Jun sparse) via `renderToStaticMarkup` and asserts real content
  survives, links are platform-shaped (`/p/ada/projects/prj-fluxlog`), the
  resolved theme incl. the customizable `--rf-accent` override reaches the
  root, rich text renders (no raw markdown/HTML), and output is deterministic.
  **12 tests**, green.
- **Visual check:** rendered home (both themes) + about to real HTML and
  screenshotted via Playwright — clean premium portfolio: serif name, accent
  headline, socials, project cards, experience with company accent + right-
  aligned date ranges + rich-text highlights. (Fixture avatar URL is a dead
  example.com link — expected.)
- **Full workspace:** `pnpm turbo lint typecheck test` → **34/34 tasks** green
  (was 31; +the portfolio template's lint/typecheck/test). The SDK API change
  (`resolveTheme` signature, the widened `TemplateDefinition` union) broke no
  consumer — resume-classic, dashboard, and apps/sites all typecheck.

## 4. Docs synchronized

- **doc 05** — the renderer-props contract now documents the portfolio
  `params` + `basePath` inputs; impl-strategy steps 1–3 marked done.
- **root `CLAUDE.md`** — SDK line notes both kinds; `portfolio-minimal` added
  to the templates inventory. New **`templates/portfolio-minimal/CLAUDE.md`**;
  updated **`packages/template-sdk/CLAUDE.md`** (union surface, portfolio
  validation rules, kind rule).
- **`DEVELOPMENT-PLAN.md`** Phase 5 — status block added; SDK-kind + first
  template marked ✅, the public-rendering / sites-table / dashboard /
  preview / SEO / second-template items marked ⏳.

## 5. Next — resume Phase 5 here

The template and its contract exist and are tested; what remains is the
**host** that serves them and the **dashboard** that configures them:

- **Public rendering in `apps/sites`** (docs 03/04): the catch-all
  `app/p/[username]/[[...slug]]/page.tsx`, Site resolution (username → Site
  record → published profile version + template@major + config, one Redis-
  cached lookup), a **portfolio template registry** (mirror
  `lib/templates.ts`; dispatch by `templateId`, re-validate config, match slug
  against the route table, pass `params`/`basePath`), and ISR pages tagged
  `site:<id>` with `revalidateTag` on publish. The `render` pipeline's
  Resolve/Project/Render stages are reused; only Deliver changes (public +
  cached vs. token-guarded).
- **`sites` table + `domains/portfolio`** (doc 07): the Site record
  (`profileId`, `slug`, `templateId`/`templateMajor`, `config` JSONB, published
  version ref, `discoverable`), slug claim with the reserved-word blocklist
  (doc 04 open question), publish flow calling `revalidateTag`.
- **Dashboard portfolio section:** slug claim UI, template pick, the
  **schema-driven settings form** reading `configSchema` (doc 03), publish.
- **Draft-preview route + iframe** (doc 08): signed-token preview render in
  `apps/sites` + the portfolio preview iframe in the editor (CSP
  frame-ancestors carve-out). Portfolio pages are universal RSCs, so the
  preview renders the real template.
- **Platform SEO** (doc 04): `generateMetadata`, JSON-LD (`Person`),
  per-site `sitemap.xml`/`robots.txt` honoring the discoverable toggle.
- **Second template** to prove the contract → unlocks the CI visual-snapshot
  harness (doc 05 impl step 4).

## 6. How to run / test what shipped

No database or server needed — the fixtures drive everything.

```bash
pnpm --filter @resfolio/template-sdk test              # 35 SDK tests
pnpm --filter @resfolio/template-portfolio-minimal test # 12 render tests
pnpm turbo lint typecheck test                          # 34/34 tasks
```

The template isn't wired to a route yet (that's the public-rendering slice
above), so there's no dev URL this session; the render harness + the
Playwright screenshot were the visual verification.

## 7. Outstanding (carried, need account access)

Unchanged: OAuth apps + Vercel env, managed Postgres host choice,
preview-deploy sign-in verification, Sentry source-map upload, and the
Cloudflare R2 + Trigger.dev credentials gating cloud PDF delivery. Phase 5 adds
one upcoming account item — whether `resfolio.site` is acquired for subdomains
(doc 04 open question), needed only when subdomains ship (V1.x), not for the
`/p/<username>` path routing this phase targets.

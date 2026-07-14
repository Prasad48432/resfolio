# 03 — Portfolio Rendering Engine

Status: Accepted

## Problem Statement

The same Profile that powers resumes must power full portfolio _websites_ —
multi-page, SEO-visible, themeable, and eventually numerous (many templates,
hundreds of thousands of sites). We need to decide what a portfolio template
_is_ (component? package? app?), how it's configured, how template-specific
needs are expressed without polluting the Profile, and how rendering scales.

The original instinct — storing portfolio templates inside this repository —
is evaluated here.

## Proposed Architecture

### Templates are React packages in this monorepo, rendered by one app

- A portfolio template is a **workspace package**
  (`templates/portfolio-minimal` → `@resfolio/template-portfolio-minimal`)
  that implements the Template SDK contract ([05-template-sdk](05-template-sdk.md))
  with `kind: "portfolio"`.
- Templates export **React Server Components** — one renderer per page type
  (home, projects, project detail, writing, about, resume) — plus metadata, a
  Zod config schema, theme definitions, and a preview image.
- A single multi-tenant Next.js app (**`apps/sites`**, see
  [04-deployment](04-deployment.md)) owns routing, data loading, caching, and
  SEO, and dispatches to the requested template through a static **template
  registry** (an explicit map of `templateId → package`, so Next can bundle
  and code-split each template; no runtime `import()` of arbitrary strings).

So: templates **are** React components, **are** packages, are **not**
independent Next.js applications, and are rendered dynamically by one app.
In-repo was the right instinct — with the discipline that templates are
sealed behind the SDK contract, not free-floating app code.

### Configuration

Portfolio state is a **Site** record (a Document in the
[01-profile-engine](01-profile-engine.md) sense): `templateId`,
`templateVersion`, and a `config` JSONB blob validated against the template's
own Zod `configSchema`. Config is presentation only:

- **Common config** (defined by the SDK, every template must honor it):
  theme choice, accent color, section visibility/order, social links display,
  analytics opt-outs.
- **Template-specific config** (defined by each template's schema): e.g.
  "hero style: split / centered", "project grid density". The dashboard
  renders the settings form _from the schema_ — new template options never
  require dashboard changes.

**Template-specific fields never extend the Profile.** If a template wants
data the Profile lacks (say, a tagline), that's either (a) config text —
fine for presentation strings — or (b) a signal the Profile schema needs a
first-class field. Data lives in the Profile; knobs live in config.

### Themes

- A theme is **CSS custom properties**, not component variants. The SDK
  defines a token vocabulary (`--rf-bg`, `--rf-fg`, `--rf-accent`, font
  slots…); each template ships named theme presets (values for those tokens)
  and declares which tokens users may override (accent color, font pairing).
- Light/dark is a theme dimension handled at the tokens layer; templates
  style against tokens only, so user customization is data, not code.

### Rendering and scale

Portfolio pages are **Server Components with zero required client JS**
(client islands allowed for motion/interactivity, same rule as `apps/web`).
Pages render once per publish and are served from cache
([04-deployment](04-deployment.md) covers ISR/tags/CDN). Rendering cost
therefore scales with _publishes_, not traffic — the registry app stays a
thin dispatch layer no matter how many templates exist.

## Tradeoffs

- **Monorepo templates couple template releases to platform deploys.** Fine —
  desirable, even — while all templates are first-party: one CI, one visual
  regression suite, atomic SDK upgrades. It becomes a constraint only with
  third-party templates (see Future Scalability).
- **One renderer app means one dependency set.** Templates can't pin their
  own React/Next versions. The SDK contract keeps templates thin enough that
  this is a non-issue, and it's precisely what prevents version-matrix hell.
- **Schema-driven settings forms** are less bespoke than hand-built ones; we
  accept generic-but-consistent controls in exchange for templates that ship
  without touching the dashboard. Custom form widgets can be added to the SDK
  vocabulary later if needed.
- **Static registry (no runtime plugin loading)** means adding a template is
  a PR + deploy, not a DB row. That's the correct safety/perf posture until
  a real third-party marketplace exists.

## Future Scalability

- **Many templates**: each is an isolated, code-split package; registry growth
  is linear and boring. Preview screenshots and visual regression are
  generated per-template in CI.
- **Blogs / CMS / custom pages**: new page types in the SDK's page-renderer
  map; templates declare support via capabilities
  ([05-template-sdk](05-template-sdk.md)), the platform routes accordingly
  ([04-deployment §Routing](04-deployment.md)).
- **Third-party templates** (someday): the SDK contract is already the
  boundary; the path is sandboxed building blocks or a submission/review
  pipeline into the same registry — _not_ arbitrary code execution. Nothing
  in V1 blocks this; nothing in V1 pays for it early.
- **White-label portfolios**: a rendering concern (strip Resfolio chrome/
  branding by plan flag), orthogonal to template architecture.

## Implementation Strategy

1. Define the SDK contract first ([05-template-sdk](05-template-sdk.md)) —
   `templates/` top-level workspace folder, `@resfolio/template-sdk` package.
2. Build `apps/sites` with the registry and one template
   (`portfolio-minimal`), home page only.
3. Add the remaining core page types (projects, project detail, about,
   resume) against the same template.
4. Second template to _prove_ the contract — the SDK isn't real until two
   templates share it. Port the visual language of the landing-page mocks
   (`apps/web/design-refs/portfolio/`).
5. Schema-driven settings form in the dashboard reading `configSchema`.

## Open Questions

- Whether `templates/` is a fourth top-level workspace folder or lives under
  `packages/templates/`. Recommendation: top-level `templates/` — they're a
  product surface with their own review bar, not infrastructure. Confirm at
  implementation and record in root CLAUDE.md.
- How template previews in the dashboard are generated (CI screenshots vs.
  live render with sample profile). Leaning: live render of a canned
  ProfileView — always current, doubles as an SDK test.
- Motion budget for templates (Framer Motion adds client JS per template) —
  set a per-template JS budget when the second template lands.

## Alternatives Considered

- **Independent Next.js app per template** — total creative freedom, and
  total operational explosion: N apps × M users deployments, N dependency
  sets, no shared caching, SDK upgrades become N migrations. Rejected.
- **Templates in a database / remote-loaded at runtime** (MDX bundles, remote
  components) — enables non-deploy template shipping, but costs sandboxing,
  security review, bundling complexity, and typed contracts. Premature until
  third-party authors exist.
- **Static site generation per user** (build & upload HTML per publish to
  R2/CDN) — attractive cost profile, but forks rendering away from the shared
  React pipeline, complicates preview parity and dynamic features (view
  counters, contact forms), and ISR-with-tags achieves the same effective
  cost. Rejected for V1; the pipeline could add an "export static" output
  later without re-architecture.
- **Themes as separate templates** — combinatorial explosion (template ×
  color × font as distinct products). Tokens make themes data. Rejected.

## Final Recommendation

Portfolio templates are **first-party React Server Component packages in this
monorepo**, sealed behind the Template SDK, registered in a static registry,
and rendered by the single multi-tenant `apps/sites` application. Site
configuration is a template-owned Zod schema stored as JSONB and rendered
into settings UI automatically; themes are CSS-token presets. This keeps V1
shippable by one team while leaving explicit, documented seams for many
templates, new page types, and an eventual marketplace.

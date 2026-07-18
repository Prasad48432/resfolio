# 05 — Template SDK

Status: Accepted

## Problem Statement

There will eventually be many templates — resume and portfolio, first- and
(someday) third-party. Without a hard contract, every template grows private
assumptions about profile shape and platform behavior, and every platform
change becomes an audit of every template. The SDK must define **what a
template is**, keep templates working as the platform evolves, and let new
platform features ship without breaking existing templates.

## Proposed Architecture

### The package: `@resfolio/template-sdk`

A small workspace package (`packages/template-sdk`) that owns:

- the **types** templates implement and consume (`ProfileView`, page props,
  theme tokens),
- the **`defineTemplate` helper** that validates and freezes a template
  definition,
- shared template utilities (date formatting, token helpers) so templates
  don't reinvent them inconsistently.

Templates depend on the SDK and _nothing else platform-side_. The platform
(dashboard, `apps/sites`, PDF pipeline) consumes templates only through the
SDK types. This single choke point is what makes evolution manageable.

### What every template exposes

```ts
export const template = defineTemplate({
  // Identity
  id: "dark-anime",                   // permanent, unique
  kind: "portfolio",                  // "portfolio" | "resume"
  version: "1.2.0",                   // semver
  compat: { profileView: 1, sdk: 1 }, // contract versions it was built for

  // Metadata (dashboard gallery)
  name: "Dark Anime",
  description: "…",
  preview: previewImage,              // static preview asset

  // Configuration
  configSchema,                       // Zod — template-specific options
  defaultConfig,                      // valid against configSchema
  themes: [{ id: "paper", tokens: {…} }, …],  // CSS-token presets
  customizableTokens: ["--rf-accent", "--rf-font-heading"],
  configFields: {                     // presentation hints Zod can't express
    bannerImage: { kind: "image", image: { width: 1200, height: 260 } },
  },
  requirements: {                     // what it can't look right without
    config: ["bannerImage"],
    profile: ["basics.headline", "sections.projects"],
  },

  // Capabilities — declarative feature support
  capabilities: {
    pages: ["home", "projects", "projectDetail", "about", "resume"], // portfolio
    atsSafe: true,                    // resume
    pageSizes: ["A4", "LETTER"],      // resume
  },

  defaultSectionOrder: ["education", "experience", "projects"], // resume

  // Renderers — React Server Components
  pages: { home: HomePage, projects: ProjectsPage, … },  // portfolio kind
  document: ResumeDocument,                              // resume kind
});
```

Renderers receive validated, resolved, read-only inputs. A **resume**
`document` receives exactly `{ view: ProfileView, config: Config, theme:
ResolvedTheme }`. A **portfolio** page renderer receives the same three plus
two routing inputs the platform owns (doc 04): `params` — the matched route
params (e.g. `{ slug }` for `projectDetail` / `blogPost`; `{}` for index
pages) — and `basePath` — the site root (e.g. `/p/ada`, no trailing slash)
the template prefixes onto inter-page links so URLs stay stable across
template switches without the template ever hard-coding a username or base.
Templates never fetch data, never read the database, never import from
`domains/*`.

Renderers are **universal components**, not strictly Server Components:
server-first (no `"use client"` at the definition, rendered as RSC on every
server surface) but written without server-only APIs, because the dashboard
renders resume templates _client-side_ for keystroke-latency preview
([08](08-dashboard-ux.md), [09](09-rendering-pipeline.md)). Portfolio
templates may additionally ship client islands for motion/interactivity;
resume templates must lay out with zero client JS.

**Why the two kinds differ here**: the asymmetry isn't taste, it's how each is
previewed. A resume is rendered *into the dashboard's own React tree* on every
keystroke, so an island in a resume template would be a client component inside
a client render — and would have to bundle into the dashboard. A portfolio is
previewed through an **iframe** pointed at `apps/sites`, so its islands are just
that page's own JS and the dashboard never sees them.

The bar an island must clear: **it enhances markup that is already there.**
Content is a `children`, never a prop; every destination a palette offers is a
real `<a href>` in the page. If the island never hydrates, the page still reads,
navigates, and indexes. `dark-anime`'s theme toggle, ⌘K palette and
scroll-reveal are the reference implementations.

### Requirements — "is it valid?" vs "is it finished?"

`defineTemplate` requires `defaultConfig` to parse clean against `configSchema`.
That means **every config field must carry a default**, and a genuinely required
field — a hero banner with no sensible default — is *unrepresentable in the
schema*. Rather than relax that check (which would let a broken template load),
requirements are a **separate declaration**:

```ts
requirements: {
  config:  ["bannerImage"],                         // keys of defaultConfig
  profile: ["basics.headline", "sections.projects"], // content at /profile
}
```

`checkTemplateRequirements(requirements, { config, view })` is pure over the
ProfileView and returns what's missing. Two scopes because the fixes live in
different places: config is fixed in the settings form, profile content at
`/profile` — a template may need content it cannot itself provide, and saying so
early beats a published site with a hole in it.

**Advisory, never enforcement.** The dashboard prompts on arrival, shows a live
checklist, and gates Publish. Nothing blocks a render: the half-filled draft
preview is exactly what the user fixes it against. Renderers must still tolerate
every field being absent — the sparse `jun` fixture is the test that they do.

`configFields` is the adjacent idea: presentation hints (`kind: "image"`,
dimensions, help text) for what Zod introspection genuinely cannot know. The
dashboard infers field shapes from the schema by default and merges these over
the top; declare only what introspection can't reach.

### Backwards compatibility — the three versioned surfaces

Compatibility is managed by versioning the **contracts**, not by freezing the
platform:

1. **`ProfileView` version** — the data projection is additive by policy:
   new fields may be added, existing fields never change meaning or disappear
   within a major version. Templates declare the major they consume
   (`compat.profileView`); the platform builds that major for them. Because
   ProfileView is a projection ([01-profile-engine](01-profile-engine.md)),
   the storage schema can churn freely underneath.
2. **Template version (semver)** — Sites pin `templateId@major`
   ([07-storage](07-storage.md)). Minor/patch updates (visual fixes) roll out
   automatically; a **major** template release is effectively a new template
   the user opts into, with the dashboard offering a preview-then-switch flow.
   A user's site never changes appearance because we refactored.
**Deleting or renaming a template is a data migration.** `sites.template_id` is
plain text and nothing enforces that the template still exists — an orphaned row
404s the live site (`getPortfolioTemplate` → undefined → `notFound()`) while the
dashboard's registry lookup fails and its editor reports "Offline". `config` must
be reset alongside the id, because config is template-owned and the old shape
fails the new schema, which renders as a *silent 404*. Migration `0009` is the
worked example. Note ISR makes this bite twice: `unstable_cache` keeps serving
the old `templateId` until `site:<id>` is dropped, so the fix looks like it
didn't work.

3. **Capabilities instead of version sniffing** — new platform features
   (blog pages, print headers, RTL) arrive as new optional capability flags +
   renderer slots. Old templates simply don't declare them: the platform
   routes around the gap (404 the blog route, hide the toggle in settings).
   A feature is added by _extending_ the SDK with optional surface — never by
   changing the meaning of existing surface.

Enforcement: `defineTemplate` + CI run every registered template against the
current SDK — config schema validity, a canned ProfileView render of every
declared page, visual regression snapshots, and (resume kind) the ATS
extraction check ([02-resume-rendering](02-resume-rendering.md)).

## Tradeoffs

- **A contract this strict slows down template authoring** ("just add a prop"
  becomes "extend the SDK"). That friction is the feature: every relaxation
  is a future breaking change. Shared utilities and a template starter keep
  authoring pleasant.
- **Supporting multiple ProfileView majors** costs a projection per major.
  Mitigation: additive-only policy makes majors _rare_; realistically we
  carry one, occasionally two.
- **Semver-pinned templates** mean users on old majors miss improvements
  until they opt in — the correct default for something as personal as a
  portfolio, but it requires the preview-then-upgrade UX eventually.
- **`defineTemplate` as data (not a class hierarchy)** keeps templates
  serializable-ish and introspectable, at the cost of some type gymnastics
  in the SDK internals (discriminated union on `kind`). Worth it.

## Future Scalability

- **New page types** (blog, custom pages, gallery): new optional entries in
  `capabilities.pages` + `pages` map.
- **New output kinds** (cover letter, OG card): new `kind` variants sharing
  the same identity/config/theming machinery.
- **Third-party templates**: the SDK is already the sandbox _boundary_;
  becoming a marketplace adds submission/review + a build pipeline into the
  same registry, not a new contract.
- **AI template assistance** (generate a theme, suggest config) works against
  the introspectable schema/tokens — another payoff of templates-as-data.

## Implementation Strategy

1. ✅ Build `packages/template-sdk` with `kind: "resume"` support only —
   `ProfileView` type, `defineTemplate`, theme tokens.
2. ✅ First resume template consumes it ([02-resume-rendering](02-resume-rendering.md)).
3. ✅ Extend for `kind: "portfolio"` (pages map, `capabilities.pages`, the
   `PortfolioPageProps` `params` + `basePath` inputs) — Phase 5, alongside the
   the portfolio template (`dark-anime`)
   ([03-portfolio-rendering](03-portfolio-rendering.md)). `defineTemplate`
   validates page coverage (every declared page has a renderer; `home` is
   mandatory) and forbids a renderer for an undeclared page.
4. Template CI harness (render every page with fixture ProfileViews, visual
   snapshots) as soon as template #2 exists. _Seed landed with
   `dark-anime`'s render tests; the visual-snapshot layer arrives with
   the second portfolio template._
5. `create-template` starter script when template authoring becomes routine.

## Open Questions

- Exact ProfileView shape v1 — finalized with the profile schema
  ([01-profile-engine §Open Questions](01-profile-engine.md)).
- Whether config schemas need UI hints beyond Zod (labels, grouping,
  control types) — likely a small `.describe()`-plus-metadata convention;
  decide when building the settings form.
- Preview asset generation: static file vs. CI-generated screenshot vs. live
  render (see [03-portfolio-rendering §Open Questions](03-portfolio-rendering.md)).

## Alternatives Considered

- **No SDK — templates as ordinary components in the sites app.** Fastest
  first template, then every template quietly couples to internals and the
  second platform refactor breaks all of them. The SDK costs days and saves
  quarters.
- **Templates as configuration only (one mega-renderer, JSON themes).**
  Maximum safety, minimum expressiveness — all templates converge on one
  layout family. Real code behind a contract is the right power/safety point.
- **Runtime plugin system (sandboxed remote code).** Needed only for
  untrusted authors; enormous security/bundling cost. Deferred until a
  marketplace is a funded goal.
- **GraphQL-style per-template data queries** (template declares the fields
  it needs). Elegant, but ProfileView is small enough to pass whole; query
  machinery is premature optimization.

## Final Recommendation

Ship a deliberately small `@resfolio/template-sdk`: templates are data
(`defineTemplate`) exposing identity, semver, metadata, a Zod config schema,
theme-token presets, declarative capabilities, and Server Component
renderers that consume a versioned, additive-only `ProfileView`. Sites pin
template majors; features arrive as optional capabilities; CI renders every
template on every change. This is the minimum contract that lets templates
multiply without multiplying platform risk.

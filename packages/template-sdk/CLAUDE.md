# @resfolio/template-sdk — the template contract

The choke point between templates and the platform
(docs/architecture/05-template-sdk.md). Templates depend on this package and
**nothing else platform-side**; the platform (dashboard, `apps/sites`, PDF
pipeline) consumes templates only through these types and helpers. This is
what lets templates multiply without multiplying platform risk.

## What lives here

- **`types.ts`** — the contract surface, a discriminated union on `kind`:
  - `ResumeTemplateDefinition` — `document` renderer + `ResumeDocumentProps`
    (`{ view, config, theme }`); `capabilities` = `{ atsSafe, pageSizes }`.
  - `PortfolioTemplateDefinition` — a `pages` renderer map (one per
    `PortfolioPageKind`) + `PortfolioPageProps` (`{ view, config, theme,
params, basePath }` — `params`/`basePath` are platform-owned routing
    inputs, doc 04); `capabilities` = `{ pages }`. `PORTFOLIO_PAGE_KINDS` is
    the platform route table.
    - **`post?: PostView`** is the one page-kind-specific input, present only
      on `blogPost`. A post body is not part of the Profile and never will be
      (it lives in its own table, doc 07), so the ProfileView cannot carry it —
      the **platform resolves it and passes it in**, exactly like `params`,
      which is what keeps "renderers never fetch data" true. A `blogPost`
      renderer must still handle `undefined`: the platform 404s an unknown slug
      first, but a template is not entitled to assume that.
  - Shared: `ThemeTokens` / `ResolvedTheme` (the `--rf-*` namespace). Re-exports
    `ProfileView` from `@resfolio/profile` **and `PostView` from
    `@resfolio/blog`** so templates import both render contracts from the SDK,
    never from `domains/*`. `PROFILE_VIEW_VERSION` /
    `SDK_VERSION` are the majors templates target.
- **`post-body.tsx`** — `renderPostBody` renders the `@resfolio/blog` node tree
  to React; `postBodyToPlainText` flattens it for meta descriptions,
  **excluding code blocks** (matching the reading-time rule — otherwise a config
  dump supplies the search snippet). Safe by construction: there is no HTML
  string in the file, every node becomes an element chosen by a `switch` over a
  closed set, and **an unknown node type renders nothing** — a body may carry a
  node from a newer editor, and guessing is how a sanitiser becomes an
  injection. Link schemes are re-checked on output, as in `rich-text.tsx`.
  Two decisions templates depend on: body headings are **demoted**
  (`h1→h2`, `h2→h3`, `h3→h4`) so the post title stays the page's only `h1`, and
  every element carries an `rf-post-*` class with no inline styles, so the
  template owns the look entirely.
- **`define-template.ts`** — `defineTemplate` (overloaded per kind) validates a
  definition (semver, kebab id, `compat`, config-schema-parses-defaultConfig,
  token names, customizable-tokens-exist-in-every-theme; for portfolio: every
  declared page has a renderer, `home` is mandatory, no renderer for an
  undeclared page) and **freezes** it. A broken template throws
  `TemplateDefinitionError` at load — loud in CI, never at request time. This
  is the doc-05 enforcement point.
- **`theme.ts`** — `resolveTheme(template, { themeId?, overrides? })` merges a
  preset with the user's overrides, **ignoring any override for a token the
  template didn't mark customizable**. `themeToStyle` → inline-style object.
- **`format.ts`** — deterministic date helpers. **No clock, no locale, no
  randomness** (doc 09): "ongoing" is a data fact (a start with no end), never
  "now". This purity is what makes preview == PDF and lets CI snapshot.
- **`rich-text.tsx`** — renders the profile Markdown subset (`**bold**`,
  `_italic_`, `[label](url)`, and `- ` unordered lists) to React,
  **re-checking link schemes on output** with the domain's own
  `safeLinkUrlSchema` (doc 10). Never emits raw HTML. Two passes: a **block**
  pass groups lines into list runs and paragraphs, then an **inline** pass runs
  within each — which is what lets a list item still carry bold and links.
  Three things not to break:
  - **Hyphen is the only list marker.** `*` is the emphasis delimiter, so
    accepting it as a bullet makes a line-leading `*emphasis*` ambiguous — and
    the ambiguity would resolve differently here than in
    `richTextToPlainText`, which must mirror this grammar exactly.
  - **A single prose line renders with no wrapper element.** That is the
    overwhelming majority of resume text; adding a `<p>` would reflow every
    existing resume to serve a feature they don't use.
  - **Lists emit `class="rf-rich-list"`, and templates must style it.** The
    name is deliberately not `rf-list` — `dark-anime` already owns that for its
    row-list layout, and the SDK renders into every template's stylesheet.
    A template with a `list-style: none` reset (as `dark-anime` has) needs an
    explicit rule or the bullets vanish.

## Rules

- **Kind:** `resume` and `portfolio` today. A new kind (cover letter, OG card)
  extends the discriminated union — never reshape an existing kind's surface.
- **Additive-only ProfileView (doc 05):** new fields may be added within a
  major; existing fields never change meaning or vanish. Bump
  `PROFILE_VIEW_VERSION` only for a true breaking change (a rare event).
- **Renderers are universal components:** server-first, no server-only APIs —
  the dashboard renders resume templates _client-side_ for keystroke preview.
  No `"use client"` in a resume renderer; zero client JS to lay out.
- **Framework-light:** imports React _types_ + a small rich-text renderer.
  Keep it that way — it's imported into every render surface.

## Tests

Co-located vitest, exhaustive: definition accept/reject, theme merge +
override gating, format determinism, rich-text safety (unsafe links degrade
to text, no raw HTML). The template CI harness (visual snapshots per doc 05)
lands with template #2.

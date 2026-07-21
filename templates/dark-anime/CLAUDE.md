# @resfolio/template-dark-anime — the portfolio template

Resfolio's portfolio template (docs/architecture/03-portfolio-rendering.md,
05-template-sdk.md), and currently the only one.

**Adapted from `github.com/Ashutoshx7/Portfolio-v2-`** — note the **trailing
dash**. `Portfolio-v2` without it is a different, unrelated site (it hardcodes
"Hi, I'm Piyush", has no banner, no index rail and no experience list). If you
are comparing against the reference, make sure you cloned the right one.

A dark-first developer site: a full-bleed banner drifting with embers, a centred
profile header below it, a dashed reading column, a fixed INDEX rail, and a
single-scroll home.

## What we kept, and what we changed

The reference is a _personal site_: its name, bio, experience list, skills and
socials are hardcoded arrays inside components (`ExperienceList.tsx` opens with
`const experiences: ExperienceData[] = [...]`). Everything that was data there
is the **ProfileView** here — that is the whole adaptation. What has no home in
a Profile (banner, tagline, quote, intro-call link) became template `config`.

Two deliberate departures:

- **Hand-written CSS, not Tailwind.** A template must render on a host that
  knows nothing about it. Tailwind classes would only work if every consuming
  app scanned this package and shipped the utilities — coupling every template
  to every host's build. The self-contained `<style>` block is what makes a
  template a drop-in (doc 05). The design is the reference's; the delivery is
  ours.
- **A footer nav the reference doesn't have.** The reference is one scrolling
  page, so it needs no nav. We render real `/projects`, `/about` and `/resume`
  routes, and ⌘K is an _island_ — a page reachable only by palette is a page a
  crawler can't reach. The footer keeps the reference's clean top while keeping
  the site navigable with no JS. (`render.test.tsx` caught this; it wasn't
  foresight.)
- **A letter mark instead of company logos.** The reference ships logo files per
  employer. We have no logo field, and inventing one to serve one template would
  be exactly the profile-model pollution `config` exists to prevent.

## Layout

- **`config.ts`** — banner, tagline, quote, intro-call link, and visibility
  knobs. Config is **content and visibility only**; colours, type and density
  are the template's own (doc 03).
- **`theme.ts`** — **the preset carries no colours, deliberately.** The platform
  resolves one preset server-side and applies it as an _inline style_; an inline
  custom property beats every stylesheet rule, so a runtime toggle physically
  could not override it. The preset carries the font slots; the palettes live in
  `styles.ts`.
- **`styles.ts`** — the self-contained sheet, every rule scoped under `.rf-site`.
  **The cascade order is load-bearing**: `.rf-site` (dark, the default — it's
  _dark_-anime) → `@media (prefers-color-scheme: light)` on
  `:not([data-theme="dark"])` → `.rf-site[data-theme="light"]`. Reorder the last
  two and an explicit Dark on a light OS silently stops working.
- **`shared.tsx`** — `href` (the one place URLs are built), ProfileView
  accessors, rows/cards, and the `Shell`.
- **`client/`** — the islands: `theme-toggle`, `command-palette`, `index-rail`,
  `reveal`, `banner-embers`, `github-graph`.
- **`pages/`** — one renderer per `PortfolioPageKind` this template declares.

## Rules

- **The hero sits below the banner, never over it.** The reference hangs the
  avatar across the banner's lower edge; we stopped, because the banner is the
  page's centrepiece and an avatar punches a hole in it. The old rules were
  keyed off `.rf-banner + .rf-col` so the negative margin only applied when a
  banner existed — that whole special case is gone, and with it the class of
  bug where a profile without a banner renders its avatar off the top of the
  page. Don't reintroduce the overlap.
- **The hero is left-anchored, and the identity is a row.** Avatar left, name
  beside it, tagline under the name, then a dashed rule and content starting
  almost immediately — everything else left too. A centred stack with a large
  headline was tried and rejected: same content, but the axis alone makes it
  read as a SaaS marketing hero instead of profile content. The banner is the
  only thing in the hero that spans the column.
- **`banner-embers` is the one island allowed to render nothing.** Every other
  island here enhances markup that is already in the HTML; this one *is* the
  effect. That's only acceptable because it is pure atmosphere over a
  decorative image — no content, no destination — so `prefers-reduced-motion`
  bailing out early costs the page literally nothing. It also stops its rAF
  loop (not throttles it) when the canvas scrolls out of view or the tab
  hides, and it holds no React state, so the component renders once per page.
  If anything readable ever ends up drawn on that canvas, this stops being
  defensible.
- **Islands are enhancements, never the page.** Every destination is a real
  `<a href>` in the server HTML; `Reveal` takes content as **children** so the
  markup is server-rendered and only _animated_ on the client; the INDEX rail's
  links are plain `#hash` anchors and only the active highlight needs JS. If an
  island never hydrates, the site still reads, navigates and indexes. That's the
  bar — and it's why portfolio renderers may have islands while resume renderers
  may not (the dashboard renders resumes client-side, doc 05).
- **No server-rendered `data-theme`.** CSS decides the key until the user
  chooses, so nobody is briefly in the wrong palette waiting for hydration.
- **The rail lists only sections that exist.** Built from the same conditions as
  the sections themselves — a rail pointing at an empty anchor is worse than no
  rail.
- **Writing is one list of one shape.** A post written natively in Resfolio and
  an article imported from RSS arrive identically (the blog domain projects
  posts into the ProfileView before this template runs), so `WritingCard` never
  asks where an entry came from — it reads the shape. `slug` → a native post at
  `<basePath>/blog/<slug>`; `url` → link out, marked external; neither → an
  inert `<div>`, because an `<a>` with no `href` is focusable, announced as a
  link, and goes nowhere. Cover, tags and reading time are each optional and
  collapse cleanly.
  - **Row separators sit on `.rf-writing > *`, not on `.rf-write`.** Each card
    is wrapped by the `Reveal` island, so `.rf-write:first-child` is true for
    *every* card — each is the only child of its own wrapper — and styling the
    card directly erases every rule in the list.
  - **`styles.ts` is one template literal: no backticks in its comments.** A
    stray pair closes the string and the file stops parsing.
- **`/blog` and `/blog/<slug>`.** The index (`pages/blog.tsx`) renders the
  **Writing section of the ProfileView** — not a separate post list — so it is
  the same `WritingCard` the home page uses and needed no new data source. The
  detail page (`pages/blog-post.tsx`) takes `props.post`, resolved by the
  platform, and renders the body through the SDK's `renderPostBody`. It styles
  the `rf-post-*` class contract in `styles.ts`; the SDK picks the elements,
  this template picks the look. No INDEX rail on a post: the rail indexes
  sections of a long scroll, and a post is one continuous piece of prose.
- **The GitHub activity graph is data-driven, and its data is client-fetched.**
  The section renders **only when the profile has a `github.com/<user>` profile
  link** (`githubUsername` in `shared.tsx`), directly below Experience — no
  config toggle, the same rule every other section follows (`config.ts` records
  why the removed `showGithubGraph` toggle is not coming back). A repo link
  (`github.com/<user>/<repo>`) is a project, not an identity, and is ignored. The
  `github-graph` island fetches the contribution calendar from the **host's
  `/api/github` proxy** — this template's one runtime dependency on its host,
  because GitHub's calendar is authenticated-GraphQL-only and the token must stay
  server-side. Where that route is absent or `GITHUB_TOKEN` is unset the graph
  degrades to a short note; the rest of the page is untouched. **Its SSR output
  is a static, date-less skeleton** — the reference seeded its empty grid from
  `new Date()`, which would break the determinism test _and_ mismatch on
  hydration; real data is fetched only in `useEffect`. The five intensity levels
  are a `color-mix` ramp over the palette tokens (`--rf-cell-*` in `styles.ts`),
  so the graph re-keys with the theme rather than shipping a second table.
- **`requirements` is advisory** (doc 05). The dashboard prompts and gates
  Publish; nothing blocks a render. Every renderer must still tolerate every
  field being absent — the sparse `jun` fixture is the test that they do.
- **Never import from `domains/*`** — only `@resfolio/template-sdk`. Section and
  item types are derived structurally from `ProfileView` in `shared.tsx`.

## Deleting or renaming this template is a data migration

`sites.template_id` is plain text with nothing enforcing that the template still
exists. Delete one without repointing its rows and every live site on it 404s
(`getPortfolioTemplate` → undefined → `notFound()`) while the dashboard reports
"Offline" (the registry lookup fails, so the save action throws). That is
exactly what migration `0009` cleans up after. `config` must be reset with the
id, because config is template-owned and the old shape fails the new schema —
which renders as a _silent 404_, not an error.

## Tests

`src/render.test.tsx`, drawing from `@resfolio/fixtures` (`ada` full, `jun`
sparse). It renders **server output only** — the islands are inert, which is
exactly the property worth testing.

Two traps it encodes:

- **Asserting a class is absent against raw HTML is a trap** — the stylesheet
  names every class, so `toContain("rf-banner")` is true on a page with no
  banner. Use the `body()` helper, which strips the `<style>` block.
- **`inlineStyle()` guards the theme split**: if a colour ever lands in the
  resolved preset, the runtime toggle silently dies.

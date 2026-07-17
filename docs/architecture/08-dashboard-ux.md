# 08 — Dashboard UX Architecture

Status: Accepted

## Problem Statement

`apps/dashboard` is the product — not an admin panel bolted onto a website. It must
feel like Linear/Raycast/Vercel-class productivity software, continue the
visual language the landing page established (without copying it), and be
architected so the defining interaction — **editing with live resume and
portfolio previews side by side** — is structurally cheap rather than a
heroic feature. This document decides the information architecture, the app
shell, the editing model, and how the design system is shared.

## Proposed Architecture

### Information architecture

The Profile is the center of the product, so it is the center of the nav:

```
app.resfolio.me/
  (auth)/login, /signup            auth screens, minimal chrome
  (dashboard)/
    profile                         THE editor — source of truth (default route)
    resumes                         documents list → /resumes/[id] editor
    portfolio                       site: template, theme, config, publish
    domains                         slug, subdomain, custom domain (phased)
    settings/{account,billing,sources}
```

Shell: a **narrow left sidebar** (nav + user menu), content area with a slim
top bar (section title, publish state, primary action). No dashboard-widget
home page in V1 — the app opens into the profile editor, because that _is_
the product. A command palette (`cmd+k`, cmdk) ships early: it's cheap,
matches the Linear/Raycast bar, and becomes the keyboard-first backbone.

The shell is composed from **shadcn/ui's `Sidebar`** (`SidebarProvider` /
`Sidebar` / `SidebarInset` / `SidebarRail` / `SidebarTrigger`), not a
hand-rolled `<aside>`. That is where the responsive and accessibility posture
comes from and why it's worth the dependency: below `md` the sidebar becomes a
`Sheet` with a focus trap and `Escape` handling; it collapses to an icon rail
with automatic tooltips; the open/closed choice persists in a `sidebar_state`
cookie **read server-side** in the `(dashboard)` layout, so a collapsed
sidebar never renders expanded and snaps shut on hydration.

What stays ours: `lib/navigation.ts` remains the single IA source (the sidebar
and the palette both read it), the Instrument Serif wordmark, and the quiet
nav rule — **inactive items are `text-muted`; only the current page earns full
contrast**. shadcn's default gives every item full `sidebar-foreground`, which
makes the column shout; the nav is furniture you look past all day.

### Design system: extract, then extend

The landing page's system (warm-cream tokens, Instrument Serif / Manrope,
`card-surface`, hairline borders) is extracted from `apps/web/app/globals.css`
into **`packages/design`** (`@resfolio/design`): the Tailwind v4 `@theme`
token block, fonts, and CSS component classes — CSS-first, no
`tailwind.config.js`, exactly as `apps/web/CLAUDE.md` already anticipates.

- `apps/web` and `apps/dashboard` both import the token layer; the dashboard
  _extends_ it with app-only tokens (denser spacing scale, focus rings,
  sidebar surfaces) rather than forking values.
- **shadcn/ui** components are generated into `packages/ui`
  (`@resfolio/ui`), themed via the shared tokens, exported through the
  package's public API. Apps never own one-off copies of primitives.
- Dashboard styling rules follow the established philosophy: hairline
  `border-border` separators over shadows, `text-muted` body / `foreground`
  headings, brand colour used only for primary actions and active states,
  motion limited to purposeful 150–200ms transforms/opacity (Framer Motion
  only in client leaves).

#### shadcn/ui is the dashboard's UI foundation — and only the dashboard's

`apps/dashboard` adopts shadcn/ui properly: `packages/ui` carries a
`components.json`, and components are **added from the registry**
(`pnpm dlx shadcn@latest add … -c packages/ui`) rather than hand-copied.
`apps/web` stays fully custom and imports none of it.

The adoption is a **token bridge, not a re-theme**. `@resfolio/design/shadcn`
(dashboard-only) maps shadcn's fixed vocabulary (`bg-primary`, `bg-card`,
`hover:bg-accent`, `bg-sidebar`…) onto the Resfolio tokens, declaring no
colours of its own. That is what lets a registry component ship _unmodified_
and stay updatable with `shadcn diff` — the alternative, editing every added
file, is a cost paid forever on every component and every upgrade.

It works because four of shadcn's names already match ours exactly:
`background`, `foreground`, `border`, `muted`. Three didn't, and the
resolutions are the interesting part:

- **`accent` → the brand token was renamed.** shadcn spends `accent` on its
  _neutral hover surface_ (menu rows, sidebar buttons, command items).
  Resfolio's brand orange held that name, so unmodified components would have
  turned every hover state in the product bright orange. The brand token is
  now **`--color-brand`** (`text-brand`, `bg-brand`, …) across
  `@resfolio/design`, `@resfolio/ui`, and both apps; `accent` is bridged to
  `--color-surface-warm`. Templates' `--rf-accent` is a separate namespace and
  is untouched, as is `resume-classic`'s user-facing `accent` config field.
- **`primary` → ink, not brand.** shadcn's `primary` is its high-contrast
  fill (Button's default, Tooltip's background). It maps to `--color-foreground`,
  because in a productivity surface the loud fill is the exception, not the
  default. Brand orange stays deliberate: `Button`'s `primary` variant reaches
  for `bg-brand` by name.
- **`muted` → not renamed, patched at the point of use.** shadcn's `muted` is
  a pale _surface_ with the text colour on `muted-foreground`; ours is the
  secondary **text** colour, at 212 call sites. Tailwind generates `bg-muted`
  and `text-muted` from one token, so they cannot both be right. Renaming ours
  would align the vocabularies completely — but that is 212 edits to fix the
  **one** registry component that wants a muted surface (`Skeleton`), because
  shadcn overwhelmingly uses `muted-foreground`. So: patch the rare case
  (`bg-muted` → `bg-surface-warm`, commented in the component), keep the
  ergonomic name. `accent` earned its rename by colliding everywhere; `muted`
  did not.

The rule this leaves: **theme through the bridge; edit an added component only
when the bridge provably cannot express it, and say why in the file.**

#### Two surfaces, and which is which

`@resfolio/design` carries both systems; picking the wrong one is the single
easiest way to make the product look like a marketing page.

|         | `card-surface` (@resfolio/design)   | `Card` (@resfolio/ui)           |
| ------- | ----------------------------------- | ------------------------------- |
| Radius  | 20px                                | 16px                            |
| Depth   | inset highlight + 32px ambient glow | 1px border, no shadow           |
| Use for | `apps/web`, the login screen        | **everything in the dashboard** |

The dashboard uses `Card`. A shadow is permitted only where the element is
genuinely elevated — a modal, a menu, a row lifted mid-drag — never as
decoration.

#### The dashboard's voice

- **Titles are Manrope**, not Instrument Serif. The serif is Resfolio's brand
  voice and belongs to marketing and the sidebar wordmark; a screen the user
  reads for hours earns hierarchy from weight, size, and space. `PageHeader`
  owns this — routes never build their own title block.
- `.label-section` (quiet, muted) is the product's section label.
  `.label-eyebrow` (accent, wide-tracked) is marketing's and stays there.
- Mono carries meaning, never decoration: URLs, slugs, keyboard shortcuts.

#### Motion contract

Easing and duration are tokens in `@resfolio/design` (`--ease-out`,
`--ease-in-out`, `--duration-press|fast|base|slow`); components never inline a
raw cubic-bezier. `--ease-out` deliberately overrides Tailwind's weaker
built-in, so the plain `ease-out` utility resolves to the platform curve.

- **`ease-in` is banned in product UI.** It delays the first frame, which is
  exactly when the user is watching, so it reads as lag. Exits use `ease-out`,
  just faster than enters.
- **Marketing entrances (`animate-fade-up`, `fade-scale`, `focus-in`) are for
  `apps/web` only** — they run 550–900ms. Product overlays use
  `animate-overlay-in|modal-in|popover-in` at 150–200ms.
- **Keyboard-triggered surfaces do not animate.** The `cmd+k` palette passes
  `animated={false}` to `DialogContent`. An animation on something summoned
  a hundred times a day is lag, not polish.
- **Popovers scale from their trigger** (`--radix-*-content-transform-origin`);
  modals stay centred, because they are not anchored to anything.
- Framer Motion lives in client leaves via `components/motion/`
  (`FadeIn`, `Stagger`/`StaggerItem`, `SwapIn`, `RouteTransition`). Shared
  primitives that Server Components render — `Button` above all — keep their
  feedback in CSS so they never drag a page over the client boundary.
- Everything respects `prefers-reduced-motion`, which means **gentler, not
  none**: movement and scale go, opacity stays.

### The editing model: form ↔ preview, never blind

Every editor route is a **split workspace**:

```
[ structured form (left) ] [ live preview (right): Resume ⇄ Portfolio tabs ]
```

- **Left pane** — React Hook Form + Zod (the same domain schemas), section
  list with drag-reorder, small focused field components. Server Component
  scaffolding; the form itself is a client island.
- **Right pane** — the real renderer, not a mock:
  - _Resume preview_: the actual resume template component in a scaled page
    box with the pagination overlay
    ([02-resume-rendering](02-resume-rendering.md)).
  - _Portfolio preview_: an `<iframe>` of `apps/sites`' draft-preview route
    (token-guarded, renders the **draft** profile) — pixel-true because it
    _is_ the sites app ([09-rendering-pipeline](09-rendering-pipeline.md)).
- **Data flow**: form state updates the preview **optimistically in-memory**
  (the ProfileView builder runs client-side on the draft — it's a pure
  function, so this is free); a debounced Server Action autosaves the draft
  (~800ms idle), with a visible `Saved / Saving… / Offline` indicator.
  Explicit **Publish** is a separate, deliberate action (snapshot version +
  `revalidateTag`, per [01-profile-engine](01-profile-engine.md)).

Because _profile_, _resume document_, and _site config_ editors are all
"form over a schema + live renderer preview," the split workspace is built
once as a layout primitive and reused three times.

### Interaction standards (bar for every feature)

- **Keyboard-first**: palette for navigation/actions, `mod+s` forces save,
  arrow/enter semantics in lists, visible `focus-visible` rings everywhere.
- **Semantic HTML + WCAG AA**; `aria-label` on icon-only controls;
  `data-testid` on every interactive element via a shared `testids` helper
  (pattern already started in `apps/web/lib/testids.ts`).
- **Perceived performance**: RSC + Suspense streaming for shell/data,
  skeletons only for genuinely async panes, `next/dynamic` for heavy editor
  islands, minimal hydration elsewhere. Lighthouse 95+ applies here too.
- **Empty states teach**: a new user's profile editor is pre-seeded with
  example structure to edit, not a blank void.

## Tradeoffs

- **Split-pane editor is the expensive V1 choice** versus a plain form —
  more layout work, an in-browser view-builder, an iframe bridge. It's the
  product's differentiator ("never edit blindly"), and the rendering
  pipeline was shaped specifically to make it a composition rather than a
  second renderer. Accepted.
- **Optimistic client-side preview** duplicates _execution_ (view built in
  the browser and on the server) but not _logic_ — one pure function from
  `domains/profile` runs in both places. That's the entire trick.
- **Extracting `packages/design` now** costs a refactor of `apps/web`'s
  globals before dashboard work starts; deferring it guarantees fork-drift
  between the two apps' themes. Pay once, early.
- **No home dashboard** may feel spartan; it avoids inventing metrics
  widgets before there are metrics. The profile editor is a stronger first
  screen. Revisit when analytics exist.

## Future Scalability

- New editors (blog posts, custom pages, cover letters) reuse the split
  workspace primitive: schema-driven form + the same preview surfaces.
- The command palette grows into the automation surface (actions, search,
  AI commands) without UI restructuring.
- Teams/orgs add a workspace switcher at the top of the sidebar — the IA
  already namespaces everything under an owner.
- AI assistance (rewrite bullet, tailor to job) attaches to form fields and
  proposes **deltas** rendered instantly in the same preview — no new
  surfaces needed.

## Implementation Strategy

1. ✅ Extract `packages/design` from `apps/web` tokens; wire both apps.
2. ✅ Set up `@resfolio/ui` with shadcn/ui primitives on those tokens —
   initially hand-authored to the pattern, then wired to the real registry
   (`components.json` + the token bridge) once the dashboard needed
   components worth not hand-rolling.
3. ✅ Build the `(dashboard)` shell: sidebar, top bar, command palette, route
   groups, auth guard.
4. ✅ Build the split-workspace layout primitive.
5. ✅ Ship the profile editor as the first full vertical slice, then the
   portfolio preview iframe once `apps/sites` had its draft route.

## Open Questions

- Resizable vs. fixed-ratio split panes, and preview collapse behavior on
  small laptops.
- ~~Whether the dashboard keeps the warm-cream light theme only or ships
  dark mode at launch.~~ **Settled: dark mode ships**, light / dark / system
  via `next-themes`. The prediction above held exactly — it was a values
  problem, not a second bridge. `@resfolio/design/dark` is a palette and
  nothing else: an unlayered `.dark` block restating the `@theme` tokens, plus
  a `destructive` override (the bridge's one literal colour, too dark for
  charcoal at 2.8:1). **No component needed a `dark:` variant**, because none
  had a hard-coded colour to begin with — the token discipline is what made
  this cheap, and is the thing to protect.
  Three constraints worth keeping:
  - **The `.dark` class must land on `<html>`**, and the rules must stay
    **unlayered**. The bridge aliases (`--color-card: var(--color-surface)`)
    are declared at `:root` and substitute *there*, so the override only
    reaches them by winning the cascade on that same element. Layer it and
    `@theme`'s `:root` wins on layer order alone; move the class to `<body>`
    and every alias freezes at its light value while the base tokens go dark.
  - **Dashboard only.** The provider is mounted in the `(dashboard)` layout,
    not the root layout: `apps/web` keeps the warm-cream identity, and
    `/login` keeps `card-surface`, a light-only surface built on inset white
    highlights.
  - The visual-QA cost is real and was the original objection; it is paid per
    *token*, not per screen, as long as new work keeps using the tokens.
- ~~Mobile dashboard posture.~~ **Partly settled**: the shell is genuinely
  responsive (the sidebar becomes a Sheet below `md`) because adopting
  shadcn's `Sidebar` made that free. Editing remains optimized for ≥1024px.

## Alternatives Considered

- **Admin-panel kit (Refine/Tremor/template)** — fast scaffolding, permanent
  template feel; contradicts the product bar. Rejected. Note this is _not_ a
  rejection of shadcn/ui, which is the opposite kind of thing: unstyled source
  you own, themed by our tokens, with no opinion about what the product looks
  like. The rejection is of kits that bring a _look_.
- **shadcn's `dashboard-01` block as the shell, adopted wholesale** — it is the
  natural starting point and was pulled down and read. Most of it is demo:
  charts (recharts), a data table (@tanstack/react-table), section cards, and
  fabricated nav. Adding it and deleting 80% would have meant inheriting those
  dependencies to keep its `Sidebar` composition. Rejected in favour of taking
  the composition and adding only the primitives that survive.
- **Re-theming each added shadcn component to Resfolio's vocabulary**
  (instead of the token bridge) — no repo-wide churn, but it breaks
  `shadcn diff`, and every future component and upgrade pays the same manual
  pass forever. Rejected; the one place it was cheaper than the alternative
  (`Skeleton`'s `bg-muted`) is documented in the file itself.
- **Preview as static mock images** — cheap, but "never edit blindly" becomes
  marketing fiction the first time mock ≠ output. Rejected.
- **WYSIWYG in-place editing on the rendered site** (Framer-style) — a
  massive editor-infrastructure bet, and wrong for data-first editing where
  one field feeds many outputs. The form+preview split _is_ the honest model
  for "one profile, many outputs." Rejected for V1.
- **Client-side data layer (React Query over REST)** — contradicts
  [06-api-architecture](06-api-architecture.md); RSC reads + actions cover
  the dashboard with less machinery. Rejected.

## Final Recommendation

A sidebar-plus-palette shell over shared `@resfolio/design` tokens extracted
from the landing page; every editor is one reusable **split workspace** —
schema-driven form on the left, the _real_ renderers (scaled resume page,
iframed draft site) on the right — with optimistic in-memory preview,
debounced autosave, and deliberate publish. Build the primitive once, ship
the profile editor as the proving slice, and every future editor inherits
"never edit blindly" for free.

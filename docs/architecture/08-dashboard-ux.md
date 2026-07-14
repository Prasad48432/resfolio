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

Shell: a **narrow fixed left sidebar** (nav + user menu), content area with a
slim top bar (breadcrumb, publish state, primary action). No dashboard-widget
home page in V1 — the app opens into the profile editor, because that _is_
the product. A command palette (`cmd+k`, cmdk) ships early: it's cheap,
matches the Linear/Raycast bar, and becomes the keyboard-first backbone.

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
  headings, accent used only for primary actions and active states, motion
  limited to purposeful 150–200ms transforms/opacity (Framer Motion only in
  client leaves).

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

1. Extract `packages/design` from `apps/web` tokens; wire both apps
   (verify `apps/web` is visually unchanged via its build + eyeball/CI).
2. Set up `@resfolio/ui` with shadcn/ui primitives on those tokens.
3. Build the `(dashboard)` shell: sidebar, top bar, command palette, route
   groups, auth guard.
4. Build the split-workspace layout primitive (resizable panes, preview
   tabs, save indicator).
5. Ship the profile editor as the first full vertical slice (form → domain
   action → autosave → live resume preview), then the portfolio preview
   iframe once `apps/sites` has its draft route.

## Open Questions

- Resizable vs. fixed-ratio split panes, and preview collapse behavior on
  small laptops — prototype during step 4.
- Whether the dashboard keeps the warm-cream light theme only or ships
  dark mode at launch (`next-themes` is in the stack; tokens make it a
  values problem, but it doubles visual QA) — recommend light-only V1,
  tokens structured for dark from day one.
- Mobile dashboard posture: read-mostly responsive shell vs. full editing —
  recommend responsive shell with editing optimized for ≥1024px in V1.

## Alternatives Considered

- **Admin-panel kit (Refine/Tremor/template)** — fast scaffolding, permanent
  template feel; contradicts the product bar. Rejected.
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

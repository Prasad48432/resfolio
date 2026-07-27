# Resfolio Dashboard Application

This application powers the authenticated product experience.

Primary domain

https://app.resfolio.me

This application is responsible for

- Authentication (sign in / sign up / session)
- Profile editor (the single source of truth: role, projects, bio, skills)
- Sources — the import workspace (GitHub, Dev.to, RSS, Stack Overflow)
- Portfolio theme + custom domain configuration
- Resume configuration, sharing, and PDF export
- Blog — writing, editing and managing native posts
- Resfolio AI — the action layer over the Profile
- Account & billing

This application is NOT the public marketing site.

The marketing site lives in

apps/web

---

# Status

Phase 3 is built on top of Phase 2. Phase 2: auth (Better Auth via
`@resfolio/auth`), the app shell (sidebar + top bar + `cmd+k` palette),
Settings → account with linked accounts. **Phase 3**: the **profile editor**
at `/profile` — the product's default screen — a section-based form over
`@resfolio/profile` with drag reorder, debounced autosave, a save indicator,
and Publish. **Phase 4 (4E/4F)**: the **resumes** feature — `/resumes` lists
resume documents; `/resumes/[id]` is the first `SplitWorkspace` editor (config
form left, live in-browser resume preview right). **Phase 5**: the **portfolio**
section at `/portfolio` — slug claim + template pick before a site exists, then
the settings editor (schema-driven config form, discoverable toggle, template
switch, publish) with the `apps/sites` draft-preview iframe. **Phase 6 (revised to import-first, "6R")**: the
**Sources** section at `/sources` — an **import workspace** (provider
gallery, triage-by-destination, needs-a-home bucket, import history):
import from external sources into the profile draft; nothing lands without an
explicit Import click. All four V1 providers are live and public — **no OAuth,
no teasers**. `/domains` remains a `ComingSoon` placeholder until Phase 7. **Phase 8
(authoring half)**: the **blog** — `/blog` lists posts and `/blog/[id]` is the
TipTap writing surface over `@resfolio/blog`; rendering posts on portfolios and
the public site is deliberately still to come. The **design-system pass** (doc 08)
then made the app a coherent product rather than a set of screens: shared
`Page`/`PageHeader`/`EmptyState`/`SaveIndicator` primitives, the product `Card`
surface replacing the landing page's `card-surface`, motion tokens + a Framer
Motion vocabulary in `components/motion/`, and a palette that no longer
animates. **The 2026-07-17 revision** then: renamed the brand token
`accent` → `brand` and adopted **shadcn/ui as the UI foundation** (the shell is
now shadcn's `Sidebar`); rebuilt the resume experience (public/private
visibility, no tokens, Download PDF, a Sections config layer). **Resfolio AI
Phases 1–6 (2026-07-27)**: `/ai` — the streaming chat foundation over the Vercel
AI SDK v7, **read-only Profile awareness**, and the **propose → review → apply**
editing flow; plus `/ai/job`, which is now the whole application sequence — **job
match**, **resume tailoring**, **cover letter** (doc 13). The model reads the
user's profile and proposes changes to it; it cannot write anything, ever — a
proposal is an object, and only a Server Action a human triggered writes a draft.
Tailoring writes a `ViewDefinition` on one resume document and leaves the profile
alone, through the same guard. A cover letter is free prose, so it gets the one
guarantee prose can have: its names and numbers are checked against the profile and
the posting. Use current
Next.js best practices from `node_modules/next/dist/docs/` when adding
features.

## Established conventions (follow these)

- **Design system** (doc 08 → "Design system: extract, then extend"). The
  dashboard is a productivity app; the landing page is not. Where they differ,
  the dashboard is always denser, quieter, faster.
  - **shadcn/ui is this app's UI foundation** — and only this app's
    (`apps/web` stays fully custom). Components come from the registry into
    `packages/ui`; read `packages/ui/CLAUDE.md` before adding one. They are
    themed by the **token bridge** `@resfolio/design/shadcn` (imported by
    `app/globals.css`, dashboard-only), never by editing the component.
  - **The brand colour is `brand`, not `accent`**: `text-brand`, `bg-brand`.
    `accent` now means shadcn's neutral hover surface — using it for the brand
    would turn every menu and sidebar hover orange. (Templates' `--rf-accent`
    and `resume-classic`'s `accent` _config field_ are unrelated namespaces.)
  - **Dark mode is dashboard-only** (doc 08, Open Question now settled):
    light / dark / system via `next-themes`, mounted as `ThemeProvider` in the
    **`(dashboard)` layout — not the root layout**, so `/login` keeps its
    light-only `card-surface` brand moment and `apps/web` is untouched. The
    switch lives in the user menu (`components/shell/theme-toggle.tsx`), a
    segmented control rather than menu items so choosing a theme doesn't close
    the menu you're comparing from. **Only the active option shows its label**;
    the other two are icons with tooltips — three labels crammed into a 224px
    menu was noise, and only one of them answers "which theme am I on". The
    active pill is a shared Framer `layoutId` so it slides rather than
    cross-fades; icon-only options keep an `aria-label`, because a tooltip is
    not an accessible name.
    `e2e/shell.spec.ts` guards the two behaviours CSS precedence would break
    silently: **explicit Light must beat a dark OS** (this is what regresses if
    the `dark` variant ever falls back to `prefers-color-scheme`) and **System
    must follow the OS with no click**. A "system → light" pass on a light OS
    proves nothing — light is also the fallback.
    **The whole theme is `@resfolio/design/dark`, a palette** — restated token
    values. Do not add a `dark:` variant to a component to "fix" it in dark:
    if something looks wrong, it is either a hard-coded colour that should be
    a token, or a token whose dark value needs tuning. The two deliberate
    hard-coded exceptions are the resume/portfolio previews
    (`bg-[#f4f1ea]`, `bg-white`) — paper and a rendered site stay light in
    both themes, because that is what they actually are.
  - **Surfaces**: use `Card` from `@resfolio/ui` (hairline border, no shadow).
    **Never `card-surface`** — that's the landing page's surface (20px radius,
    ambient glow) and is confined to `apps/web` plus `/login`, the one brand
    moment in this app. A shadow is only for something genuinely elevated: a
    modal, a menu, a row lifted mid-drag.
  - **Every page** is `<Page>` + `<PageHeader>` (`components/layout/`). Never
    hand-roll a title block or pick your own `max-w-*` — that's exactly how the
    routes drifted apart before. `<Page wide>` opts an editor out of the reading
    measure for its preview pane.
  - **Titles are Manrope**, never `font-display`. Instrument Serif is the brand
    voice: marketing and the sidebar wordmark only. Use `.label-section` (quiet)
    in-product, never `.label-eyebrow` (accent, marketing). Mono means something
    — URLs, slugs, shortcuts — it is not decoration.
  - **Empty states** are `<EmptyState>`: `size="page"` for a whole route,
    `size="inline"` for an empty section inside a form.
  - **Autosave UI** is `<SaveIndicator>` over the shared `SaveStatus`
    (`lib/save-status.ts`). Never redeclare either — all three editors share
    them; an editor simply may not reach every state.
  - **Transient notifications are Sonner**, via `toast` from `sonner`.
    `components/status/toaster.tsx` is mounted **once, in the root layout**, so
    every route can toast. That puts it _outside_ the `(dashboard)`
    `ThemeProvider` — deliberate and safe: `useTheme()` with no provider
    returns an empty context, so `resolvedTheme` is undefined and it falls back
    to light, which is exactly right for `/login`, the one light-only screen.
    Inside the dashboard the provider supplies the real value.
    It is themed by pointing Sonner's own `--normal-*` CSS variables at
    Resfolio tokens rather than by a `classNames` entry per variant — that way
    toasts we never style by hand still look like the product.
    **The division of labour matters**: `SaveIndicator` owns _persistent_
    state (this document is dirty / saving / invalid), toasts own _events_ that
    happened once (published, downloaded, deleted, failed). Do not toast on
    autosave — a notification on every keystroke pause is noise.
- **Motion** (doc 08 → "Motion contract"). Easing/duration are tokens in
  `@resfolio/design`; never inline a cubic-bezier or a magic ms. `ease-out`
  resolves to the platform curve (the `@theme` block overrides Tailwind's).
  - Framer Motion belongs in client leaves via `components/motion/`: `FadeIn`,
    `Stagger`/`StaggerItem`, `SwapIn`, `RouteTransition`. Shared primitives that
    Server Components render — `Button` especially — keep feedback in **CSS**, so
    they never drag a page over the client boundary.
  - **Never animate a keyboard-triggered surface.** The palette passes
    `animated={false}` to `DialogContent`.
  - `prefers-reduced-motion` means gentler, not none: movement goes, opacity
    stays. `useReducedMotion()` in JS; the media query in CSS. **A reduced-motion
    branch must still render the same box** — `RouteTransition` used to return its
    children bare, which made the app's layout chain depend on an OS setting; a bug
    like that is only ever reported as "it looks broken on my machine".
  - Marketing entrances (`animate-fade-up`/`fade-scale`/`focus-in`, 550–900ms)
    are `apps/web`'s. Product overlays use `animate-overlay-in`/`modal-in`/
    `popover-in` (150–200ms).
- **CSS layering**: base rules in `@resfolio/design` live inside `@layer base`.
  Unlayered CSS beats _every_ cascade layer, so an unlayered rule there would
  override Tailwind utilities app-wide with no way to opt out (this is what made
  the focus ring un-suppressible on the palette input). Keep new global rules in
  a layer.
- **The app shell** (`components/shell/`) is composed from shadcn's `Sidebar`:
  `AppShell` = `TooltipProvider` → `SidebarProvider` → `AppSidebar` +
  `SidebarInset`. That is where the responsive/a11y posture comes from — mobile
  `Sheet` with a focus trap, icon rail with tooltips, `cmd+b`.
  - **The shell is one viewport tall and the _content region_ is the app's scroll
    container, not `<body>`.** This is a four-link chain — `SidebarInset`
    (`h-dvh overflow-hidden`) → the content `div`
    (`grid grid-rows-[minmax(0,1fr)] overflow-y-auto`) → `RouteTransition`
    (`flex min-h-0 flex-col`) → the page. **Break any link and nothing throws**:
    `flex-1` silently resolves against `auto`, the document grows a scrollbar, and
    any bottom-anchored element walks off the screen. That is exactly how the AI
    chat broke. Guarded by `e2e/shell.spec.ts` ("the content region scrolls, not
    the document").
    - **`grid-rows-[minmax(0,1fr)]` is doing real work** and is not
      interchangeable with `flex-1`: the `1fr` max gives the child a _definite_
      height so full-height routes can fill it, while the `0` min lets an ordinary
      taller page overflow and scroll. A `flex-1` child would get the definite
      height but could never exceed it.
    - **A page fills the viewport by asking for `min-h-0 flex-1`** on its `Page`
      (only `/ai` does). Everything else grows and the region scrolls, exactly as
      body scroll used to.
    - **`h-dvh`, not `h-svh`.** `dvh` normally risks resizing under a reader's
      thumb, but browser chrome collapses in response to _document_ scroll — which
      no longer happens — so it sits still, and unlike `svh` it follows the mobile
      keyboard. That pairs with **`interactiveWidget: "resizes-content"`** in the
      root layout's `viewport` export, which is what keeps the chat composer above
      the keyboard rather than behind it.
    - The content region is a **`div`, not a `main`** — `SidebarInset` already
      renders one, and nested `main` landmarks are invalid.
    - The top bar is **not** `sticky` any more, deliberately: it is outside the
      scroller, so sticky positioning there would be dead CSS describing a layout
      the app no longer has.
  - Two more things not to break:
  - `defaultOpen` comes from the **`sidebar_state` cookie read server-side** in
    the `(dashboard)` layout. Drop that and a collapsed sidebar renders
    expanded, then snaps shut on hydration.
  - **Inactive nav items are `text-muted`**; only the current page earns full
    contrast (doc 08). shadcn's default gives every item full
    `sidebar-foreground`, which makes the column shout.
    The palette stays `cmd+k` (no clash), and `lib/navigation.ts` is still the
    single IA source for both the sidebar and the palette.
  - **The collapsed icon rail is 3rem, and things break in it, not in the
    expanded sidebar.** Two traps, both now covered by `e2e/shell.spec.ts`:
    - The header carries `px-4`, which leaves a **16px** content box in the
      rail — so it drops its padding and centres when collapsed. It shows
      `ResfolioLogo variant="mark"` there and the wordmark when expanded (the
      whole link used to hide, leaving no brand at all). Put the visibility
      classes on **wrapper spans**: `ResfolioLogo` concatenates `className` onto
      its own `inline-flex` with no tailwind-merge, so `hidden` would tie with
      it and the winner would be Tailwind's emit order.
    - **Tailwind preflight's `img { max-width: 100% }` beats `width`**, so an
      `<img>` avatar in a narrow box renders as a vertical _ellipse_ (13×28)
      while `size-7` holds the height — and `shrink-0` can't stop it, since
      that's flex shrink. Hiding the identity block and chevron is the fix;
      `max-w-none` pins the invariant. Note the fallback `<span>` avatar is
      immune, so **the bug is invisible to any test user without a picture** —
      the spec forces the `<img>` branch via the DB.
  - **The nav's active and hover states are overridden in `sidebar.tsx`, and
    both must stay overridden.** The registry spends one token on both
    (`hover:bg-sidebar-accent` _and_ `data-active:bg-sidebar-accent`), which
    made the current page indistinguishable from whatever the mouse was over —
    and that token bridges to `surface-warm`, 2% off the sidebar's own
    background. Active is now a **brand** wash, hover a **neutral ink** wash:
    different hue, so they can't be confused. Note tailwind-merge only drops
    the registry class whose modifier set matches yours exactly — override
    `hover:` on the active branch too, or it survives at equal specificity and
    the active item flickers back on hover.
- **Route groups**: `(auth)` = minimal-chrome public screens (`/login`);
  `(dashboard)` = everything behind `requireSession` (its layout verifies
  the session server-side and renders `AppShell`).
- **Route guarding is three layers deep** (doc 10): `proxy.ts` does an
  _optimistic_ cookie-presence redirect (never trusted), the `(dashboard)`
  layout verifies via `requireSession`, and every Server Action resolves
  the session itself through the action helper. The proxy is
  **one-directional** — it only redirects _to_ `/login` on a missing
  cookie, never _away_ from it on presence; the login page does the
  signed-in-skips-login redirect via a real `getOptionalSession` check. This
  is deliberate: a cookie can outlive its DB session (revocation, a dev DB
  reset), and a presence-based `/login`→app redirect would loop against the
  layout's session→`/login` redirect (regression-tested in `e2e/auth.spec`).
- **Server Actions** are built with `createAction` from `lib/actions.ts`:
  resolve session → parse with Zod → call handler → typed `ActionResult<T>`
  (`lib/action-result.ts`). Actions contain no logic; throw `ActionError`
  for expected failures. Unexpected errors are logged + sent to Sentry and
  the client sees a generic message.
- **Env**: compose slices from `@resfolio/env` in `lib/env.ts`; the app
  reads only observability vars directly — auth/database vars are
  validated by their own packages. `.env.example` documents local setup.
- **Test ids**: every interactive element gets a `data-testid` from the
  `lib/testids.ts` registry (static keys or the exported helper functions).
- **Nav**: `lib/navigation.ts` is the single IA source consumed by the
  sidebar and the command palette — extend it there, never in components.
  The sidebar renders `NAV_ITEMS`; the **palette renders `PALETTE_ITEMS`**
  (= `NAV_ITEMS` + `PALETTE_EXTRA_ITEMS`), for destinations that are worth
  finding by name but do not earn a permanent row — `/ai/job` is the first.
- **Profile editor** (doc 08, form-first; preview pane arrives Phase 4):
  the route reads/seeds the draft server-side via
  `@resfolio/profile/server` (`getOrCreateProfile`) and hands it to the
  `ProfileEditor` client island (`components/profile/`). One React Hook
  Form holds the whole draft; **sections are data-driven** —
  `lib/profile-form.ts` describes each section's fields, so adding or
  reshaping a section is a descriptor change, not a new component. Autosave
  lives in `use-profile-autosave.ts` (debounced, re-validates with the
  domain schema before every write, carries `draftRev` for optimistic
  concurrency, `mod+s` forces a save); Publish is a separate deliberate
  action, disabled unless there are unpublished changes (seeded from
  `ProfileDraft.hasUnpublishedChanges`, flipped on edit, cleared on publish) so
  an unchanged draft can't be re-snapshotted. Mutations go through
  `app/(dashboard)/profile/actions.ts` (thin `createAction` adapters over the
  domain) — **never** query the DB or put business logic in the app.
  - **Every field renders its own error, and this is not optional.** The save
    indicator's `invalid` copy says "check highlighted fields"; for a long time
    nothing highlighted anything — the resolver computed errors that no
    component read. `FieldInput` now subscribes per-field
    (`useFormState({ name })` for the subscription, `getFieldState` for the
    dotted-path lookup) and renders `aria-invalid` + a message. `aria-invalid`
    is the **single source of truth** for the error state in `@resfolio/ui`;
    style off anything else and the visual and the screen reader disagree.
  - **`invalid` does not disable Publish.** It used to, which made the button
    dead at exactly the moment the user needed to be told what was wrong.
    Clicking now runs `form.trigger()` (the resolver is `onChange`, so an
    untouched seeded field can be invalid with no error recorded yet) and jumps
    to the first bad field via the pure `lib/form-errors.ts`. The save
    indicator's `invalid` state is also a button for the same jump.
  - **Dates are `MonthYearPicker`, never a text input.** A `date` descriptor
    declares `dateBound: { field, direction }` naming its sibling, and the
    picker **disables** the impossible months — an end before its start is
    prevented, not validated after the fact. Bounds are `YYYY-MM` strings
    compared lexicographically (`lib/month-year.ts`, pure + tested): that
    format sorts in date order, so no `Date` and therefore no timezone can move
    a value across a boundary. `present: true` marks a field where empty reads
    as "Present".
- **Resumes editor** (doc 08/09, 4E/4F): `/resumes` reads documents via
  `@resfolio/document/server`; it also renders `PublicResumeCard`
  (`components/resume/`) at the top — the shared handle claim plus a `Select`
  pinning which resume renders at the public `/r/<handle>` route
  (`setPublicResumeAction` → `@resfolio/profile/server`'s `setPublicResume`).
  With one resume the route auto-uses it (the domain's `getSoleResumeId`), so the
  picker only becomes load-bearing at two or more. `/resumes/[id]` loads the
  document + the profile draft and hands both to the `ResumeEditor` client island
  (`components/resume/`). The `SplitWorkspace` primitive
  (`components/workspace/`) is form-left / preview-right, reused by every
  future editor. The preview renders the **real** template chosen by the
  document's `templateId` (from `lib/resume-templates.ts`, the dashboard's resume
  registry — mirror of `apps/sites/lib/templates.ts`) in-browser via the pure
  `buildProfileView` (same function the print route runs — that's the parity
  guarantee), scaled to fit with advisory page-break guides
  (`lib/resume-preview.ts`, pure + unit-tested). **Multiple resume templates**
  (`resume-classic` sans, `resume-editorial` serif) share this one editor because
  their config schemas are structurally identical; the "New resume" button is a
  template picker, and resumes are **one per template** (enforced in the document
  domain). A resume **presents**
  a profile, it never contains one — nothing in this editor edits content; that
  is `/profile`, one click from every empty state. The one place that rule bends
  is AI tailoring (doc 13, Phase 5), which writes `view.deltas`; `TailoredNotice`
  at the top of the left pane **names the deviation where the document is edited**
  (`countTailoredFields` + a Reset), because prose in the preview that appears
  nowhere in the profile, unexplained, is exactly the confusion the rule exists to
  prevent. Its Reset needs no Server Action — this editor already owns and
  autosaves `view`, so `clearTailoring(view)` through `setView` persists itself and
  the preview updates at once. The left pane is three
  groups:
  - **Sections** — the configuration layer (`components/resume/resume-sections.tsx`
    over the pure, tested `lib/resume-sections.ts`). It writes a
    **`ViewDefinition`** (`sectionOrder` / `include` / `order` / `exclude`) — the
    exact thing `buildProfileView` already read, which is why this needed no
    migration and no domain change. Name/contact/links/summary have
    **no controls** (they're `basics`). The default view is `{}` — everything on,
    empty sections auto-dropped — so the toggles exist to _hide_ content you have.
    - **Two levels of drag**: sections reorder against each other (writing
      `sectionOrder`), and items reorder within a section (writing
      `sections[key].order`). Nested `DndContext`s, so **both need an explicit
      `id`** or dnd-kit's generated aria ids collide.
    - **`locked` means un-hideable, never un-movable.** Experience and Education
      keep their drag handle and lose only their switch — a resume without your
      work history isn't a resume, but "Projects, Experience, Skills, Education"
      is a perfectly reasonable thing to want.
    - **The panel renders `orderedSections(view)`, not a fixed list** — a mirror
      of the domain's `orderedSectionKeys`. `RESUME_SECTIONS`' own order means
      nothing and is a label/lock lookup only. It used to be presented as the
      render order while quietly disagreeing with it (Education sat second,
      rendered fourth); a panel you can drag _must_ show the truth.
    - **Default order is the chosen template's** `defaultSectionOrder`, seeded
      into a new document by `createResumeAction` and then owned by the user.
      Nothing re-imposes it, which is why existing resumes keep the order they
      have rather than silently rearranging on deploy.
  - **Layout** — the resume config schema (page size, **font size**, margins,
    accent, icons, **per-link visibility**). Presentation only. Unlike the
    portfolio form these controls are **hand-written**, so a new config key needs
    a control here (and an entry in the `PAGE_SIZES`/`MARGINS`/`FONT_SIZES`
    tuples). Every resume template shares this exact config shape, which is what
    lets one form serve them all — a template that wants a different knob breaks
    that contract (see `templates/resume-editorial/CLAUDE.md`).
    - **Font size is `medium | small`**, implemented as a type scale in the
      template (`TYPE_SCALE` in `templates/resume-classic/src/styles.ts`), not
      as per-rule sizes. Every size is emitted as a `--rf-size-*` custom
      property, so a hard-coded `pt` in a rule now reads as an inconsistency
      rather than hiding as a missed edit. `small` is deliberately **not** a
      uniform multiplier: body copy takes the full reduction, section titles
      only about half, because shrinking the labels at the same rate flattens
      the hierarchy that makes the page scannable.
    - **Link visibility is stored as `hiddenLinkIds` — a deny list.** The
      default must be "show everything" (that is what every existing resume
      does), and a link added to the profile later should appear rather than
      stay invisible until someone remembers to tick it. An allow list would
      silently drop new links, a bug the user only finds after sending the PDF.
      The switches therefore read inverted in `LinkVisibility` and nowhere else.
  - **Sharing** — `visibility` (public/private) + the permanent public URL.
    Mutations go through `app/(dashboard)/resumes/actions.ts` (thin `createAction`
    adapters over `@resfolio/document/server`); `updateResumeAction` takes
    `name`/`config`/`view`/`visibility`.
    **Download PDF** is `GET /api/resumes/[id]/pdf` — a route handler, not an
    action, because the product need is a real browser download
    (`Content-Disposition: attachment`). The **client** fetches it and saves
    the blob rather than using a plain `<a download>`: a PDF takes seconds
    (Chromium boots) and the anchor gave no sign it had been pressed, so people
    pressed again and queued a second render — and the route's real failure
    modes (**501** export not configured, **502** render host down) answer with
    JSON, which the browser navigated to and displayed as raw text. Fetching
    buys a real in-flight state, click suppression, and a toast on failure; the
    cost is buffering the file in memory, which is fine at resume size. **This is the trust boundary**:
    `apps/sites` has no sessions, so this route verifies the session, verifies it
    owns the document (`getDocument` is user-scoped), and only then calls the
    render host with the `RENDER_SECRET` bearer. Env-gated on
    `render.dashboard` (`RENDER_SECRET` + `SITES_URL`); absent, the button hides.
    **Kill switch: `PDF_EXPORT_ENABLED=false`** turns the whole feature off —
    `resumeExportEnabled()` hides the button **and** the route hard-refuses
    (503), so no request reaches `apps/sites` or the Fly PDF service (a
    cost/safety lever). A hidden button is never the only guard.
    It renders the **draft** (matching the preview); the public URL renders the
    **published** version — the Sharing panel says so, because people get this
    wrong.
- **Public username (handle) is shared, and claimable from two places.** The
  username is a **profile handle** (`@resfolio/profile`), not a portfolio-only
  slug — one identity behind both `/p/<handle>` and `/r/<handle>`. The claim UI
  is one shared island, `components/handle/handle-field.tsx` (debounced live
  availability), driven by shared actions in `app/(dashboard)/handle/actions.ts`
  (`claimHandleAction`, `checkHandleAvailabilityAction`). **Both** `/portfolio`
  (the `PortfolioClaim` step) and `/resumes` (the `PublicResumeCard`) render it —
  whichever the user reaches first claims the name, and the other prefills it.
  There is no `checkSlugAvailabilityAction` any more.
- **Portfolio section** (doc 03/04, Phase 5): `/portfolio` reads the user's Site
  via `@resfolio/portfolio/server` (`getSiteForOwner`). No site → `PortfolioClaim`
  (the shared `HandleField` + template radio pick; `createPortfolioSiteAction`
  claims the handle then creates the site). Has a site → `PortfolioEditor`
  (`SplitWorkspace`: settings form
  left, draft-preview iframe right). The config form is **schema-driven** —
  `lib/config-form.ts`'s `describeConfigSchema` introspects the template's
  `configSchema` into field descriptors (`ConfigFields` renders them), so a new
  config option never touches the dashboard. Config is **content/visibility only**
  — the portfolio templates are opinionated and own all styling (doc 03), so the
  form surfaces toggles/counts/template-specific content (a cover image, a
  quote), not color/theme pickers. `lib/portfolio-templates.ts`
  is the pick/config registry (mirrors the `apps/sites` render registry).
  - **Introspection first, metadata only where it can't reach.** A template's
    `configFields` supplies what Zod cannot say — that a URL is an image, that it
    wants 1600×900 — and is merged over the inferred shape. Note metadata is
    consulted **before** the type switch: a cover image is
    `z.union([z.literal(""), z.url()])`, an unknown shape the switch rightly
    skips, so checking it inside `case "string"` would never fire.
  - **Requirements** (doc 05) surface three ways: a `SetupDialog` on arrival
    (from the server's list, shown once — re-opening as you type would be
    torture), a live `MissingChecklist` above the form, and a disabled Publish.
    **Config gaps are recomputed client-side** so typing a cover URL clears the
    warning immediately; **profile gaps keep the server's answer** (they can't
    change without leaving the page). Nothing gates the preview — a half-filled
    page is what the user fixes it against.
  - **The page uses `safeParse`, not `.parse`.** `.parse` threw the entire
    settings page when stored config didn't fit the schema — precisely when the
    user most needs the page that could fix it. Autosave
    persists config + discoverable; a **template switch** resets config to the new
    template's defaults (URLs are unaffected — routes are platform-owned) and the
    editor **remounts** on the template `key` (the `router.refresh()` after a switch
    is a soft refresh that would otherwise keep stale client state). **Publish** is
    gated on `SiteRecord.hasUnpublishedChanges` (+ the version pin), so it disables
    when the live page is already up to date and re-enables on any presentation
    edit; it calls `publishSite` then `apps/sites`'s `/api/revalidate`.
    Mutations go through `app/(dashboard)/portfolio/actions.ts`.
  - **The preview pane is a placeholder, deliberately (2026-07-18).** It used
    to iframe `apps/sites`'s draft-preview route, re-minting a signed token
    after every save — a full re-render of a second application to answer "what
    does this look like?", at a cost that grows with every template. The route
    is gone; `PreviewPlaceholder` keeps the **bar unchanged** ("Draft preview"
    - a real "Open live site" link) and stubs only the pane between them, so
      restoring a real preview is a swap of one component's body.
  - **A template asks only for what it genuinely can't render without.** The
    generic visibility toggles and count knobs (`showAvatar`,
    `showCommandHint`, `featuredProjectCount`, `showGithubGraph`) were removed
    from `dark-anime`: templates are opinionated (doc 03), so they decide, and
    anything genuinely absent is driven by absent _data_, not by a switch.
    Reusable visibility toggles may return as a platform concern once two
    templates want the same one — not as per-template booleans.
  - **A config field whose Zod shape is a union renders no control unless the
    template declares a `kind`.** `introCallUrl` (`"" | url`) was invisible in
    this form for exactly that reason — the template could see the setting; the
    user had no way to set it. `ConfigFieldMeta.kind` now carries `url`
    alongside `image`/`textarea`, and `config-form.test.ts` guards it.
  - **The favicon is a general, template-independent site setting**, not config.
    `FaviconField` (`components/portfolio/favicon-field.tsx`) uploads the
    `favicon` asset kind and hands back the **key** (not the URL — keys survive
    the origin moving, doc 07); it is stored in `sites.favicon_key` and resolved
    to a URL for the browser-tab icon on every `/p/*` page (SEO metadata in
    `apps/sites`). It **saves immediately** through `updatePortfolioSiteAction`
    (`faviconKey`) — a one-shot upload, not a field you keep editing — and
    `router.refresh()` so the Publish button reflects the now-pending change; it
    is a presentation edit, so it needs a Publish to reach the live site. The
    action validates the key parses to a `favicon` asset **owned by the caller's
    profile** before storing, and marks it referenced via `markReferencedKeys`
    (the key lives in a column, so `collectAssetKeys` can't find it by walking
    config).
- **Sources section** (doc 12 import-first, Phase 6R): `/sources` is the
  **import workspace** — "Import from…" provider gallery on top (**four live
  `PublicConnectCard`s: GitHub, RSS, Dev.to, Stack Overflow — no teasers**; a
  greyed "coming soon" card is an advert for something the user can't have, on
  a page they came to work on), then triage (pending items grouped by
  destination with per-group Import all, a destination Select for unrouted
  "needs a home" items, inline edit-before-import, Skip), import history
  (receipts with a "Newer version available" badge and a **warned** re-import
  when the user edited their copy), and a demoted "Connected sources"
  management row (Check for updates / Remove). Reads via
  `@resfolio/integrations/server` (`listConnections`, `listPendingItems`,
  `listImportReceipts`), mapped to plain DTOs in `lib/sources.ts` (display
  strings only — no `raw` provider payloads ever reach the client), rendered
  by the `SourcesView` island (`components/sources/`). Mutations go through
  `app/(dashboard)/sources/actions.ts`: `connectPublicSourceAction`
  (`PUBLIC_CONNECTOR_IDS` — in V1 that's every connector there is) runs the
  first import inline; `importItemAction` takes `routeTo`/`edits` and
  revalidates `/profile` too because the import mutates the profile draft.
  Nothing reaches the profile without an explicit Import click; imported items
  are ordinary profile content, and publish stays at `/profile`.
  **A connector may never propose the user's identity** (2026-07-17): no
  candidate kind carries name/summary/location/avatar and `basics` is
  not a route target. The one non-section destination is `profileLink` →
  "Profile links" (`basics.links`, edited by `components/profile/links-editor.tsx`).
  Only its `label` is inline-editable — the url is a fact the connector derived,
  and editing it would only break the link.
- **Blog** (doc 07/01, Phase 8): `/blog` lists posts via `@resfolio/blog/server`;
  `/blog/[id]` is the post editor (`components/blog/`). Mutations go through
  `app/(dashboard)/blog/actions.ts`.
  - **Not a `SplitWorkspace`, deliberately.** The résumé and portfolio editors
    split because their output is a visual artefact you configure while watching
    it. A post's output _is_ the text you are already looking at, so a preview
    pane would show the same words twice and halve the width of both. One
    centred column; everything that is not the writing (slug, excerpt, SEO,
    delete) lives in a collapsed `PostSettingsPanel`, because each of those is
    touched about once per post while the body is touched constantly. This is
    also the one editor that does **not** use `Page`/`PageHeader` — it has its
    own sticky header carrying the save indicator, reading time and the publish
    switch, because the writing surface owns the full column.
  - **The editor is uncontrolled.** TipTap owns the document; `onUpdate`
    reports outward and nothing writes back in. Driving ProseMirror from React
    state round-trips every keystroke through a re-render and a `setContent`,
    which destroys the selection and makes typing feel laggy.
  - **The browser validates with the server's own schema.** `blogBodySchema`
    comes from the pure root of `@resfolio/blog`, so what the editor checks
    before saving is literally what the server checks — not a second copy.
  - **Node names in `components/blog/extensions.ts` must match the domain
    schema exactly.** `getJSON()` is stored verbatim after that schema
    validates it, so a rename on one side alone produces a document that saves
    fine in the editor and is rejected by the server.
  - **Paste and drop share one handler** and both return `true`, which is what
    stops the browser also inserting the image as a `blob:`/`data:` URL that
    would break on reload. Images insert **at the cursor**. The handler is
    reached through a **ref**: `editorProps` is evaluated inside the `useEditor`
    call while the handler needs `editor`, and written directly that cycle
    reads the `const` before it initializes.
  - **Bodies store the asset `key`, not just the URL** (doc 07) — the key is
    what cleanup counts and what survives the delivery origin moving.
    `use-image-upload.ts` keeps both halves of the upload response; the shared
    `ImageUpload` component returns only a URL and is right for profile fields
    that store one.
  - **The slug follows the title only until the post is first published.**
    After that its URL is a promise to whoever linked to it, and silently
    rewriting it because a typo was fixed in the title breaks those links with
    no warning.
  - **The image ceiling is configurable**, not hardcoded:
    `BLOG_MAX_IMAGES_PER_POST` (the `blog` env slice) with the domain's default
    of 5 as fallback, read through `lib/blog-config.ts` so the upload check, the
    editor budget and the repository's enforcement cannot disagree.
  - Editor typography is `.rf-prose` in `app/globals.css`, inside
    `@layer components` — the same stylesheet the published-post renderer will
    use, so writing and reading do not drift.
- **Resfolio AI** (doc 13, Phases 1–6): `/ai` is a Server Component gate over
  one client island (`components/ai/`); `/ai/job` is a **sequence** — job match,
  then resume tailoring, then a cover letter, all off one pasted posting.
  Everything model-facing lives in `lib/ai/`.
  - **`lib/ai/provider.ts` is the only file in the repository that names a model
    vendor.** Everything else takes the AI SDK's `LanguageModel`. Changing
    provider or model is editing that file — do not import `@ai-sdk/openai` (or
    the gateway) anywhere else. It resolves **two credentials, gateway first**:
    `AI_GATEWAY_API_KEY` (Vercel AI Gateway) or `OPENAI_API_KEY` (direct).
    - The gateway needs **no extra dependency** — `ai` re-exports
      `createGateway`. Its key is passed **explicitly**, never left to the SDK's
      own ambient `AI_GATEWAY_API_KEY` lookup, or that lookup becomes a second
      `process.env` reader outside `@resfolio/env`.
    - **`AI_MODEL`'s format follows the key**: `openai/gpt-5-mini` through the
      gateway, `gpt-5-mini` direct. Two defaults, not one — a shared default
      404s on whichever path it wasn't written for.
    - **`isAiConfigured()` only proves a key exists, not that it can spend.** An
      unfunded key mounts the UI and fails mid-stream via `onError`; the client
      currently renders that as a generic "didn't go through". Making that
      legible is an outstanding fix, not a designed behaviour.
  - **The three route handlers exist because a stream is the product
    requirement, and for no other reason.** Doc 06 allows a route "where the
    caller isn't our React app": `useChat` (`/api/ai/chat`) and `useObject`
    (`/api/ai/job`, `/api/ai/cover-letter`) all need a response body that is still
    being written, which a Server Action cannot return. The letter is the clearest
    case in the feature — the output is prose, so streaming _is_ the product rather
    than a stand-in for it. **Every mutation stays a Server Action** — accepting a
    proposed change, applying tailoring, and Phase 7's job-application save. All
    three routes read; none writes. Do not add a fourth for anything that isn't
    streamed, and note Phase 5 deliberately isn't one (see below).
  - **Guard order is the design**: `requireSession` → kill switch (503) →
    configured (501) → rate limit (429) → parse/size (400/413) → model. Each is
    cheaper than the next, so a flood costs a cookie lookup, not an OpenAI
    request. `AI_ENABLED=false` hides the nav item **and** hard-refuses, the same
    shape as `PDF_EXPORT_ENABLED` — a hidden button is never the only guard.
  - **`lib/ai/limits.ts` holds every ceiling**, and they are cost controls, not
    validation niceties. `chat-request.ts` enforces them (pure + tested):
    oversized single messages are **rejected, never truncated** — truncation
    silently answers a different question — and over-budget conversations are
    trimmed **oldest-first**, so the turn the user just typed always survives.
  - **`lib/ai/rate-limit.ts` is the app's first general rate limiter** (doc 06
    promised one; Better Auth's is its own and doesn't generalise). Keyed per
    **user and mode**, and **a mode is a real budget, not a key prefix**:
    `chat` gets 20/10min, `job` and `tailor` get 6 each (one analysis sends a
    posting _and_ the whole profile), and `letter` gets 4 — the tightest, because a
    letter is the one output people reroll rather than accept. One `Ratelimit` per
    mode, memoised — the instance carries its own budget, so the mode cannot be an
    argument to `limit()`. Inert without Upstash, like the auth limiter.
  - **`lib/ai/profile-context.ts` builds the model's view of the Profile**
    (pure + tested). Three rules it exists to enforce:
    - **The seeded starter content is stripped.** A new profile ships with
      "Example Company" / "Your most recent role" — right for the editor
      (doc 08: empty states teach), poisonous for a model, which will discuss
      the user's job there in perfect good faith. Detection compares against a
      **freshly built `createSeedProfile()`** ignoring ids, so changing the seed
      can't silently break it. Do not replace this with a hardcoded string list.
    - **Over-budget profiles lose whole items, never truncated strings**, and
      the model is told it happened. A trimmed profile must never be
      indistinguishable from a thin one, or the assistant tells someone with a
      hundred roles they're light on experience.
    - **JSON, not prose**, because Phase 3's proposals address items by `id` and
      fields by name — a prose rendering makes the model guess both.
  - **The page runs the same builder as the route**, so the screen and the model
    can't disagree about whether the profile is empty. Only the boolean crosses
    to the client — the serialized profile is the model's context and must not
    end up in a browser bundle.
  - **The profile is loaded server-side, not as a tool call.** It's needed for
    every message in this mode, and the read being user-scoped by construction
    is what stops a prompt talking the model into reading someone else's.
    Re-read per request, because the user may have edited in another tab.
  - **`lib/ai/tools.ts` holds the model's one tool**, `proposeProfileChanges`,
    and the app's `AiUIMessage` type. Three things not to break:
    - **The tool set is built per request, closed over the profile that request
      loaded** (`createProfileTools(draft.data)`). No profile id crosses the
      wire and `execute` performs no lookup, so there is no parameter a prompt
      could talk the model into changing.
    - **`execute` is pure** — it runs `@resfolio/profile`'s
      `reviewProfileChanges` and returns the partition. It has no database
      access and never will; the write is `applyProfileChangesAction`.
    - **`tools` must be passed to `convertToModelMessages` as well as
      `streamText`**, because that is what applies `toModelOutput`. Without it
      the whole diff is re-sent — and re-billed — on every later turn of the
      conversation. `AiTools` is a **`type`, not an `interface`**: only type
      aliases get an implicit index signature, and without one it isn't
      assignable to the SDK's `ToolSet`. It is also written out rather than
      inferred, because pnpm's layout makes the inferred type unnameable
      (TS2742).
  - **`app/(dashboard)/ai/actions.ts` is the only write in the feature.** It
    re-parses the changes with the domain schema and **re-runs the guard against
    the current draft** — client-round-tripped model output is not less hostile
    than model output, and a proposal validated ninety seconds ago may no longer
    fit a profile edited in another tab. It takes **no `draftRev` from the
    client** (unlike the profile editor, this page holds no draft): it reads and
    writes in one request, and a concurrent autosave then fails its own
    optimistic check and rebases. Accept-one and Apply-all are the same action
    with a different array — the batching is in the transport, not the consent.
  - **`AiMessage` renders `message.parts`, never `message.content`**, and this is
    the load-bearing UI decision. Concatenated text would work today and would
    have to be torn out the moment a profile diff needs to render as a diff.
    Adding a result type is a new `case` in that switch — which is exactly what
    Phase 3's `tool-proposeProfileChanges` case is. It is typed via
    `AiUIMessage` (`import type`, so nothing server-side is bundled), which is
    what makes `part.output` a real `ProfileChangeReview` rather than a cast.
  - **The review UI's per-change Apply button is the consent, not decoration.**
    A single "accept these six improvements" button is the same product as a box
    that writes straight into the profile with an extra click bolted on. Apply
    all is secondary and only appears above two outstanding changes.
    The diff is **quiet, not red/green** — nothing is being deleted, one piece
    of the user's writing is replacing another, and colour is not the only
    signal (a left rule plus weight carries the direction). **Refused
    suggestions are counted on screen**: the guard dropping two changes is the
    feature working, and a user who never learns it happened cannot tell this
    product from one that would have written "Kubernetes" into their skills.
  - **No fake progress — but the gap before the first token is now filled with
    real states.** `/api/ai/chat` opens its `createUIMessageStream` **before** the
    profile read and writes `data-progress` crumbs at genuine transitions
    (`reading` → `thinking`, carrying the real `itemCount`; `truncated` when the
    generation hit its ceiling). Doc 13 refused "Reading your profile…" in Phase 2
    because the read finished before the stream existed — the label became honest
    when the _order_ changed, not because the standard was relaxed. Three rules:
    - **Crumbs are `transient: true`.** They never enter `message.parts`, so they
      are not posted back on the next turn, never reach the model as context, and
      cannot linger beside a finished answer. `useChat`'s `onData` holds them in
      component state for the life of the turn.
    - **There is no phase for "writing".** While text streams, the text _is_ the
      indicator; a label beside it is a caption on something already visible.
    - **`createUIMessageStream` needs its own `onError`.** Moving the profile read
      inside `execute` means a failed database read is a stream error rather than
      an unhandled 500 — without that handler it would be swallowed to a generic
      string with nothing in the logs.
  - **An assistant turn is never allowed to render as nothing — in either
    direction.** Unhandled part types fall through to `null`, so a turn carrying
    only reasoning drew an avatar and blank space, which reads as a crash.
    `AiMessage` takes `settled` (only the last message can still be arriving) and
    renders **both** empty cases: settled gets a real explanation with a real next
    step (`aiEmptyTurn`), still-arriving gets a working indicator (`aiWorking`).
    The second is not a nicety — reasoning parts are deliberately not rendered and
    the SDK opens the assistant message the moment the stream starts, so for the
    first several seconds of every _healthy_ turn `status` is already `streaming`
    (the composer's "submitted" marker is gone) and the message has nothing in it.
  - **The user's bubble is `muted`, never the registry's `default`.** That variant
    is `bg-primary`, and the bridge maps `primary` to **ink** — so a sent message
    rendered as the highest-contrast fill the theme owns: black-on-cream in light,
    a white slab in dark. `surface-warm` plus a hairline is the app's own panel
    language, and it follows the palette instead of inverting it. The border is set
    at the call site because `BubbleContent` ships `border-transparent`, and in
    light the fill alone is 2% off the page.
  - **Reasoning tokens are spent from `maxOutputTokens`, and nothing that runs
    against a reasoning model may use the shared default.** The default model is a
    reasoning model, so a prose-sized ceiling silently truncates a turn that has to
    _think_ — and when that turn was about to call a tool the result is an empty
    assistant message, which is what made "fix 1, 2, 5 and 7" look like the feature
    exiting. Hence `MAX_CHAT_OUTPUT_TOKENS` (separate and much larger),
    `stepCountIs(3)` so a fully-refused proposal has a step left in which to _say_
    so, and `reasoningTokens` logged apart from `textTokens`. Do not lower the chat
    ceiling back to the shared one.
    - **It is worse for `streamObject`, and that is what broke `/ai/job`.**
      Structured output has no partial credit: a generation stopped by its ceiling
      is JSON that fails validation, so `useObject` finishes with `object`
      undefined and every panel conditioned on a result renders nothing — the
      screen went from "Reading the posting…" to blank, for a call billed in full.
      Both object routes now use **`MAX_OBJECT_OUTPUT_TOKENS`**, and
      `MAX_TAILOR_OUTPUT_TOKENS` was raised to match.
    - **"Finished with nothing" is a state, not silence.** `useObject` sets
      `error` only for a failed _request_; a successful one whose object never
      validated said nothing at all. `TEST_IDS.jobEmpty` / `letterEmpty` render a
      sentence with a next step, and the routes log `finishReason` +
      `reasoningTokens` beside the error — on screen "the model refused" and "the
      ceiling cut it off" are identical, and nothing else tells them apart later.
  - Errors render as a `Marker` in the transcript, not a toast — a failed answer
    belongs where the answer would have been and must not evaporate (doc 08's
    division of labour).
  - **The chat is a bounded three-row layout, not a page with a chat in it.**
    Column (`min-h-0 flex-1 overflow-hidden`) → messages (`flex-1 min-h-0`) →
    composer (`shrink-0`). It only works because the shell hands down a definite
    height (see the app-shell notes above), and `/ai`'s `Page` asks for it with
    `min-h-0 flex-1`. The composer grows **upward** into the message area as its
    textarea does, so its bottom edge never moves — it is a grid row, not sticky
    positioning, so it cannot come unstuck. `useAutosize` owns the textarea height
    (measure after resetting to `auto`, in a layout effect not an input handler,
    and toggle `overflow-y` with the ceiling); `field-sizing: content` would do it
    natively but has no Safari support yet. **The height ceiling lives in one
    place** — the hook — never also as a `max-h` class.
  - **The assistant avatar is `self-start`.** The registry's `MessageAvatar` is
    `self-end`, which suits a chat app where a turn is a line or two; here a turn
    is routinely twelve paragraphs and a bottom-pinned avatar floats beside the
    _end_ of an answer, hundreds of pixels from the message it identifies. The mark
    is presented as an app icon (squircle, hairline ring, no plate) rather than a
    filled square centred in a circle, which is what looked unfinished.
  - **Chat sessions are saved (Phase 7)** — `@resfolio/ai` + `ai_chat_sessions`
    (migration **0014**). `/ai?c=<id>` is a **search parameter, not a route
    segment**: `/ai/job` already occupies that position, and a dynamic sibling
    would make "job" an id nobody may be assigned. The transcript is loaded
    server-side and user-scoped, so a stranger's id resolves to nothing.
    - **A stored transcript is a record, never context.** Nothing reads the table
      on the way to a provider — the model's context is still built per request.
      That is the rule the domain exists to keep; see `domains/ai/CLAUDE.md`.
    - **Saving is a Server Action, once per settled turn.** No fourth route
      handler: the rule is that a route exists only where a stream is the product
      requirement, and this is a write of a finished thing. `AiChat` fires on the
      busy → settled **status edge**, not on a message count — `regenerate()`
      replaces the last answer without adding a message, and a count would never
      save the rewrite. `AiWorkspace` serialises saves through a promise chain.
    - **The rail's list is client state, seeded from the server.** The alternative
      is `router.refresh()` after every save, which re-renders the route
      mid-conversation and remounts the transcript being read. For the same
      reason, the URL is claimed after the first save with
      **`history.replaceState`, not `router.replace`** — the router would
      regenerate the new-chat id, change `AiChat`'s `key`, and remount everything
      to update an address bar.
    - **`AiChat` is keyed on the session id.** `useChat` reads `messages` once, on
      mount; two conversations are two components.
    - **Delete asks nothing, Clear history asks.** One destroys a row the user is
      pointing at; the other reaches everything scrolled out of view.
  - **Stop is a cost control.** The route passes `request.signal` as
    `abortSignal`, so cancelling actually stops generation and therefore billing.
  - **Usage is logged, not tabled** (`onFinish` → `createLogger("ai")` with
    user, model, mode, token counts). A billing meter later reads that call site.
  - **Job match (`/ai/job`) is a route, not a chat mode** (doc 13's open
    question, settled in Phase 4). One input, one result — a conversation
    metaphor would add turn-taking to something with exactly one turn and bury a
    score inside a scrolling transcript.
    - **`lib/ai/job-analysis.ts` is where every number comes from.** The model
      classifies `strong|partial|gap` and cites profile item **ids**; this file
      resolves the citations, **demotes a match whose citations resolve to
      nothing** (an unverifiable match is fabrication arriving as a score), does
      the arithmetic, and checks keyword coverage with a **word-boundary** match
      — `includes` reports that a profile saying "Google" has "Go", and telling
      someone their resume already says something it doesn't is the damaging
      direction of that error.
    - **`evidence` comes before `level` in the schema, deliberately.**
      Structured output is generated in schema order, so the model must find its
      support before stating a verdict, and a streamed row never displays a
      level that hasn't been verified. A tidy-up that alphabetised those fields
      would silently undo both; `job-analysis.test.ts` guards it.
    - **The page ships the item index and the context JSON, never the raw
      profile.** Keyword coverage is checked against _exactly what the model
      read_, so a stripped starter placeholder can't be reported as coverage.
    - **The pasted posting is the only third-party-authored prompt in this
      product.** It goes in as a delimited user message, never spliced into the
      system prompt. The real guarantee is that the route has no tools and no
      write path.
  - **Resume tailoring (Phase 5) lives on `/ai/job` and has no route handler.**
    `app/(dashboard)/ai/job/actions.ts` holds all three actions — the model call
    included. That is doc 13's rule applied, not abandoned: **the guard needs the
    profile's content** (the growth rules compare against stored values), so the
    review must be built server-side, so the client has nothing to render as it
    arrives, so a stream would be streaming to nobody. Phase 4 could stream
    because verifying a match needed only an item index. Do not "improve" this
    into a third route.
    - **`export const maxDuration = 60` on `job/page.tsx` is load-bearing.**
      `maxDuration` is route-segment config, so a Server Action inherits it from
      the page it is invoked from; without it the platform default kills a
      twenty-second tailoring pass and it reads as a model failure.
    - **The guard ladder is the routes' ladder in action form** —
      `requireAiBudget` (enabled → configured → rate limit under its own `tailor`
      mode), then the JD boundary via the same tested `parseJobRequest`, then the
      model. Length is checked there rather than in the Zod input so an oversized
      posting gets its own sentence instead of "Invalid input."
    - **Tailoring writes a `ViewDefinition`, never the profile** — the domain rules
      are in `domains/profile/CLAUDE.md` (`tailor.ts`). What this app adds: the
      **draft** is the guard's base (that is what the user is looking at), and a
      delta for an item the _published_ version lacks is inert rather than an
      error, because `buildProfileView` resolves deltas per item.
    - **Applying is live.** Documents have no draft/publish split, so a public
      resume changes at its URL on the click. The panel says so beforehand.
    - **`clearTailoringAction` is not a convenience.** Tailoring is cumulative — a
      second pass leaves the first pass' overrides on every field it doesn't touch
      — so `countTailoredFields` is shown with a Reset beside it. Without that a
      resume tailored twice is tailored for neither and the only escape is deleting
      it.
    - **Content changes keep per-change consent; reordering gets one button.** A
      rewrite can put an unread sentence on a resume; a reorder cannot state
      anything, so per-item consent there would charge six clicks for a decision
      with no downside.
    - **`components/ai/change-diff.tsx` is shared by both reviews** — the chat
      proposal and the tailoring review must look identical, and a second copy
      would drift on which side is the new one. `resume-tailor.tsx` renders
      **inside `JobAnalyzer`**, which owns the pasted posting: a second textarea
      is the surest way to have the analysis and the tailoring disagree about
      which job the user meant.
    - **The page ships three fields per resume**, not documents — a
      `ViewDefinition` in a browser bundle to answer a question about a name.
    - **Known lost-update window**: a `/resumes/[id]` tab open from before a
      tailoring pass overwrites the new deltas on its next autosave (the editor
      holds the whole `view` in client state and documents carry no `rev`). Same
      as for `config` today; fixing it means a document revision + optimistic
      check.
  - **Cover letters (Phase 6) are the case where nothing structural was
    available, so the guarantee is a _checked vocabulary_.** `lib/ai/cover-letter.ts`
    is pure and has 27 tests, roughly half of which assert that legitimate phrasing
    is **not** flagged — a warning list with noise in it is one nobody reads, and
    then the real flag goes unseen too. Four things to understand before touching
    it:
    - **The rule is: every name and number in the letter must appear in the
      profile _or the posting_.** The posting in the haystack is the whole trick —
      it is what lets a letter say "the Senior Engineer role at Acme" without
      flagging the company name in every letter ever written. It is also stated to
      the model verbatim, so the prompt and the check are one rule twice, not a
      request plus an unrelated audit.
    - **Detection is by sentence position, not a dictionary.** A capitalised word
      mid-sentence is a name; sentence-initial is ambiguous and only flagged when a
      digit or an internal capital marks it anyway. `ALWAYS_CAPITALISED` is the one
      stoplist and it holds only the first person — **keep it tiny**; a list big
      enough to cover English sentence openers is a list that swallows real
      fabrications.
    - **There is no `greeting` and no `signoff` field.** The platform composes both
      (recipient + `basics.name`), so an invented "Dear Ms. Chen" has nowhere to
      live. The recipient the user types **never leaves the browser** — the request
      body is `{ jobDescription }` only, reusing the job route's `parseJobRequest`.
    - **A clean result is stated out loud** (`TEST_IDS.letterChecked`). "We checked
      and found nothing" is the claim that distinguishes this from a product that
      shrugged; a user who only ever sees the warning version can't tell.
    - **Nothing is persisted, and the UI says so.** A letter's home is a column on
      the job application (Phase 7), by the document domain's rule that documents
      carry no content fields.
  - **`lib/ai/system-prompt.ts`'s `CHANGE_LIMITS` is shared and must stay
    shared.** Two workflows now emit `ProfileChange`s validated by the same domain
    code (chat → profile draft, tailoring → resume view). Restating those five
    lines in the second prompt guarantees one copy drifts, and the one that drifts
    is the one nobody rereads.
  - **`vitest.config.ts` now aliases `@/`** — needed because `rate-limit.ts` is
    the first unit-tested lib module that reaches env.
- **String arrays** (skills, technologies) are edited with `TagsField`
  (`components/profile/tags-field.tsx`), the RHF binding over `@resfolio/ui`'s
  `TagInput` chip editor — never a comma-separated text input. Enter (and
  comma) commits a trimmed tag, duplicates are rejected case-insensitively,
  every chip has a remove button; the pending text stays inside the component
  so autosave only ever sees the committed `string[]`.
- **Selects** use the Radix `Select` from `@resfolio/ui` (`SelectTrigger` +
  `SelectValue` + `SelectContent`/`SelectItem`), never native `<option>`s —
  put the `data-testid` on the `SelectTrigger`; in e2e, open the trigger and
  click the `option` role (Playwright's `selectOption` no longer applies).
- **Unit tests** (`vitest`): co-located `lib/**/*.test.ts`. **E2E**
  (`playwright`): `e2e/` runs the real OAuth dance against a local mock
  authorization server (`AUTH_E2E_MOCK_ISSUER`, localhost-only by
  construction). Locally: start docker Postgres (host port 5433), build the
  app, then `pnpm test:e2e`.
- **Security headers/CSP** live in `next.config.ts`; update the CSP when
  adding an external origin (images, connect). Nonce-based CSP is a
  planned hardening (doc 10).

---

# Architecture

The architecture for this app is decided in `docs/` at the repository root.
Read these before building features here:

- `docs/architecture/08-dashboard-ux.md` — information architecture, app
  shell (sidebar + command palette), the split-workspace editor primitive
  (form left, live resume/portfolio preview right), design-system extraction
  into `packages/design`.
- `docs/architecture/06-api-architecture.md` — reads via Server Components,
  mutations via Server Actions that are thin adapters over `domains/*`
  packages; the shared `ActionResult` convention. Business logic never lives
  in this app.
- `docs/architecture/01-profile-engine.md` — draft/publish model the editor
  implements (autosave mutates the draft; Publish snapshots a version).
- `docs/architecture/09-rendering-pipeline.md` — previews use the real
  renderers (in-browser resume template, iframed `apps/sites` draft route);
  this app never re-implements rendering.
- `docs/architecture/13-ai-layer.md` — the AI layer: propose → validate →
  review → apply, why `LLM → database mutation` does not exist, and why
  no-fabrication is a property of the proposal schema rather than of the prompt.

---

# Technology

Framework

- Next.js App Router

Language

- TypeScript

Shared packages

- `@resfolio/design` — the shared design system (warm-cream light theme,
  Instrument Serif / Manrope / JetBrains Mono, semantic tokens incl. the
  **`brand`** colour, motion tokens `--ease-*`/`--duration-*`, `card-surface`
  classes). Imported in `app/globals.css` after `tailwindcss`, followed by
  **`@resfolio/design/shadcn`** — the shadcn token bridge, imported here and
  nowhere else (`apps/web` stays custom). Fonts load in `app/layout.tsx` via
  `next/font` with the CSS variables the tokens expect. `app/globals.css` then
  **extends** the layer with dashboard-only tokens (`--spacing-sidebar`,
  `--spacing-topbar`, `--spacing-page`, `.label-section`) — extend it there,
  never fork a shared value.
- `@resfolio/ui` — this app's shadcn/ui foundation. Hand-authored primitives
  (`Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Card`,
  `TagInput`, `Spinner`) plus registry components (`Sidebar`, `Sheet`, `Tooltip`,
  `Separator`, `Skeleton`, `Select`, `Dialog`, `Command`, `DropdownMenu`).
  **Prefer a primitive over a raw HTML control** — the editors use these, not
  bare `<select>`/`<input>`. Import from `"@resfolio/ui"` only — never internal
  paths. `app/globals.css` carries `@source "../../../packages/ui/src";` so
  Tailwind scans the package's classes; keep it if you move the CSS file.
  **Adding a component has a procedure** — `packages/ui/CLAUDE.md`.
- `@resfolio/env` — the only sanctioned reader of `process.env`
- `@resfolio/auth` — Better Auth server instance + `requireSession`;
  client components import `@resfolio/auth/client`; the proxy imports
  `@resfolio/auth/cookies` (edge-safe, no DB)
- `@resfolio/observability` — `createLogger(scope)` + Sentry helpers,
  wired in `instrumentation.ts` / `instrumentation-client.ts`
- `@resfolio/eslint-config`, `@resfolio/typescript-config`

Styling rules: use semantic token utilities (`bg-surface`, `text-muted`,
`border-border`, accent sparingly) — never hard-coded hex. Follow the same
Server Components-by-default convention documented in `apps/web/CLAUDE.md`.
Design direction for real features lives in
`docs/architecture/08-dashboard-ux.md`.

---

# SEO

This app is authenticated and must not be indexed. Keep `robots: { index:
false, follow: false }` in the root layout metadata (already set) and extend
it per-route if new top-level routes are added outside auth.

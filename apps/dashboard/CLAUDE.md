# Resfolio Dashboard Application

This application powers the authenticated product experience.

Primary domain

https://app.resfolio.me

This application is responsible for

- Authentication (sign in / sign up / session)
- Profile editor (the single source of truth: role, projects, bio, skills)
- Job Tracker — the application board and the flow view over `@resfolio/job`
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
Phases 1–7 (2026-07-27)**: `/ai` — the streaming chat foundation over the Vercel
AI SDK v7, **read-only Profile awareness**, the **propose → review → apply**
editing flow, and saved transcripts. **Phase 7 folded the whole job workflow into
that one conversation** and retired `/ai/job`: paste a posting, the model calls
`analyzeJobMatch`, and the artefact panel beside the chat carries the posting, the
resume and the cover letter — with **job match sessions persisted in the new
`@resfolio/job` domain**, which is already the Application Tracker's table
(doc 13). The model reads the
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
  - **The matrix loader reads as a light, not as a coloured dot**
    (`components/status/matrix.tsx`, reworked 2026-07-29). It looked flat and the
    obvious diagnosis — "the colour isn't bright enough" — was only a third of it:
    a real light source has a **white-hot centre** and carries its hue in the
    falloff, so a dot filled flat in any accent reads as a slightly larger dot
    whatever value you pick. Four things together, and the first two are the ones
    that matter: `--matrix-head` (a separate core colour, `--color-surface` rather
    than a hard-coded white so it does not invert in light mode) inside a gradient
    that fades to the accent; a **two-radius bloom** merged *under* `SourceGraphic`
    so the halo throws past the edge while the core stays sharp — merged the other
    way round it buries the dot in its own light and looks out of focus; a
    **six-cell tail** with a floor under the dim end, because the eye reads
    direction from the length of the fade and cells at a literal 0.05 are
    indistinguishable from the unlit grid; and a 1.35 head scale. The accent is
    `brand-soft`, not `brand-3` — the soft peach was picked when this was
    background furniture, and beside a streaming answer it is the one thing on
    screen claiming work is happening.
  - **Status text beside a loader shimmers** (`.shimmer`, in `@resfolio/design`).
    A static line next to a moving grid reads as the label having got stuck, so
    every "we are working" string wears it: the chat's progress crumbs,
    `aiWorking`, the job-match and cover-letter panels, `MatrixLoader`'s label.
    It implements shadcn's `shimmer` contract — same class names, same custom
    properties, same `shimmer-none` escape hatch — **written rather than
    installed**: the documented route is `@import "shadcn/tailwind.css"`, and
    dropping a third-party utility sheet of unknown layering into this cascade
    (layered design package, deliberately *un*layered dark palette) to obtain one
    keyframe is not a trade worth making. Three things it must keep doing: derive
    the highlight from **`currentColor`** via relative colour syntax, so it is
    correct on muted copy, on brand text and in both themes with nothing passed;
    **restore `-webkit-text-fill-color` in every off-branch** (reduced motion,
    unsupported `oklch(from …)`) — a naive `animation: none` leaves transparent
    glyphs painted by a background that has stopped moving, i.e. blank space
    where the status was; and carry **`box-decoration-break: clone`**, or an
    inline element that wraps renders every line after the first as nothing.
    **The geometry is scale-free, and it has to be.** The sweep layer is
    `200%` of the element and `--shimmer-spread` is a *percentage* of that —
    a departure from shadcn's length-based `shimmer-spread-<number>`, forced by
    the fact that most text wearing this class is two words. A fixed 7rem band
    was wider than a 4rem "Sending…", so every glyph lit at once and nothing
    moved; and because `background-position` percentages resolve against
    (box − image) width, which goes negative once the image is wider than the
    box, the animation also ran backwards and mostly off-screen. Both failures
    are silent — the text renders, it just never shimmers — which is why the
    keyframe's `150% → -50%` endpoints look inverted and are correct.
  - **And it rotates: `WorkingText` (`components/status/working-text.tsx`) over
    the banks in `lib/ai/status-words.ts`** (2026-07-29). The shimmer fixed a
    line that looked *stuck*; it could not fix a line that had nothing further to
    say for the thirty seconds a reasoning model takes. Every wait now cycles
    short present participles — "Thinking…", "Weighing it up…", "Joining the
    dots…" — one every 2.4s.
    - **A bank is a set of synonyms for one running phase, never a sequence of
      stages.** That is the whole of what keeps this inside doc 13's "no fake
      progress": rotating within a bank claims nothing new, and only the server
      reporting a phase change swaps the bank. Adding a word that names another
      phase's work turns the rotation into an invented pipeline. Banks are pure,
      tested data; the words are ≤3 words and carry no punctuation (the ellipsis
      belongs to the renderer).
    - **The cycling word is `aria-hidden`, and the bank's first word is rendered
      once in a `sr-only` span.** A live region changing every 2.4s is re-read
      every 2.4s for the length of the wait; the rotation is a visual answer to a
      visual problem and has nothing to say to someone not looking at it. Which
      is also why index 0 carries the object ("Reading your profile") — it is the
      announcement, and what reduced motion pins for the whole wait.
    - **The interval is deliberately not the shimmer's 2s.** Locked together they
      beat, and the word swaps on the same frame the highlight crosses it.
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
    - **`grid-cols-[minmax(0,1fr)]` is required for the same reason on the other
      axis, and its absence was a real bug.** An implicit grid column is an `auto`
      track whose _minimum_ is the item's min-content width, so the track could not
      shrink below the widest unbreakable thing anywhere on the page — and
      everything in the track grew to match. That is how one long token in a pasted
      job description pushed the **page header** off the right edge of a phone.
      The subtlety worth knowing: `overflow-wrap: break-word` (Tailwind's
      `wrap-break-word`, which `MessageContent` sets) breaks a long word when it
      _would_ overflow but deliberately does **not** reduce the min-content
      contribution — so the paragraph rendered wrapped while the track sized to the
      unbroken word. Use **`wrap-anywhere`** (`overflow-wrap: anywhere`) wherever
      model output or pasted text is rendered; it is the one that counts in the
      intrinsic size. `RouteTransition` carries `min-w-0` for the same reason; keep
      both, or the layout's correctness depends on the other file not being edited.
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
  **A `key` must equal the first URL segment** — the sidebar's active state and
  `sectionLabelFor`'s top-bar title both match on `/${key}`, so a mismatch breaks
  both silently. The sidebar renders `NAV_ITEMS`; the **palette renders `PALETTE_ITEMS`**
  (= `NAV_ITEMS` + `PALETTE_EXTRA_ITEMS`), for destinations that are worth
  finding by name but do not earn a permanent row. **`PALETTE_EXTRA_ITEMS` is
  empty today**: `/ai/job` was its only entry and Phase 7 retired it. Kept rather
  than deleted, because the composition is the shape and the next
  tool-with-a-URL belongs there rather than in a component.
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
  - **Triage rows settle optimistically, and must keep doing so.** Skip and
    Import used to `await` the action and _then_ `router.refresh()` before the
    row moved — two sequential round trips, the second a full RSC re-render that
    re-reads connections, staged items and receipts. Locally both are
    milliseconds and it feels instant; in production they are a serverless
    invocation plus a managed Postgres, and the X the user pressed spins for a
    second or more. The work was never slow, it was **serialised behind the wrong
    event**. `TriageBoard` holds a `settled` id set, the row leaves on the click,
    and a failure restores it with the error attached. The "To review · N" count
    reads the filtered list — a count that disagrees with the rows is the same lag
    wearing a different hat.
    **A connector may never propose the user's identity** (2026-07-17): no
    candidate kind carries name/summary/location/avatar and `basics` is
    not a route target. The one non-section destination is `profileLink` →
    "Profile links" (`basics.links`, edited by `components/profile/links-editor.tsx`).
    Only its `label` is inline-editable — the url is a fact the connector derived,
    and editing it would only break the link.
- **Job Tracker** (doc 13, 2026-07-28): `/jobs` reads jobs via
  `@resfolio/job/server` (`listJobMatches`), maps them to plain DTOs in
  `lib/jobs.ts`, and hands them to one client island (`components/jobs/`) — the
  `/sources` shape. Mutations go through `app/(dashboard)/jobs/actions.ts`. **The
  data layer already existed**: `job_match_sessions.status` has been written on
  every row since the table was created, precisely so this screen would not
  arrive with a backfill. Every posting analysed in a conversation is already a
  card, in Saved.
  - **`JobTracker` owns the list; the board and the flow are two views of it.**
    Not one fetch each — a diagram showing eight interviews beside a column
    holding seven cards is the kind of contradiction that makes a user distrust
    both numbers, and the surest way to produce one is to let each view read its
    own copy.
  - **Moves are optimistic, per the Sources triage lesson.** The card lands in
    the new column on drop and the action follows; never `await` → `router.refresh()`
    before it moves. A failure **re-reads** rather than restoring locally: a
    rollback assumes nothing else changed, and the usual cause of a failure here
    is the job having been deleted in another tab.
  - **Columns are rendered from `JOB_STATUSES`**, the domain's array, in its
    order. A board with its columns declared locally loses one silently the day a
    state is added, and every card in it becomes invisible rather than mis-sorted.
  - **This is the repo's first cross-container drag** (`@dnd-kit/core`, already a
    dependency; the profile and resume editors use `sortable` for vertical
    lists). Deliberately **not** `sortable`: there is no position column on a job,
    so ordering within a column would be something the user arranges and the
    database forgets. Cards are draggable, columns droppable. The `DndContext`
    needs an explicit **`id`** (generated aria ids collide — see
    `resume-sections.tsx`), and `KeyboardSensor` is not optional: it is both the
    accessibility story and the only way Playwright can drive a move.
  - **The horizontal scroll belongs to the board, not the page.** The shell's
    content region is `grid-cols-[minmax(0,1fr)]` exactly so a wide child cannot
    size the page; six columns must scroll in their own box.
  - **The flow view is hand-drawn SVG over a pure, tested layout**
    (`lib/job-flow-layout.ts`), splitting layout from drawing the way
    `lib/pdf/cover-letter-layout.ts` does — geometry you cannot unit-test is
    geometry that renders wrong in a file somebody sends out. **No charting
    dependency**: there is none in this workspace and three stages with seven
    nodes and no crossing edges does not earn the first one. Colours are token
    utilities (`fill-brand`, `fill-live`, `fill-muted`), deliberately quiet — a
    wall of red beside fifteen rejections is a chart telling someone how to feel
    about their own job search.
  - **Export, not a share link.** The diagram names every company that turned the
    user down. `job-flow-export.ts` serialises the live SVG with its computed
    styles inlined (an in-document SVG inherits its colours from the page, so the
    raw markup opens black-on-black) and rasterises through a **data URL** — a
    blob URL taints the canvas in Safari and `toBlob` then refuses.
  - **The company mark is a plain `<img>` on `https://www.google.com/s2/favicons`**,
    with `referrerPolicy="no-referrer"`, `max-w-none` (preflight's
    `img { max-width: 100% }` beats `width` — the shell's avatar hit this) and a
    `Building2` fallback in state. Not `next/image`: a 16px third-party icon
    through the optimizer is a request larger than the file, and it would need a
    `remotePatterns` entry. **The CSP's `img-src` in `next.config.ts` is the list
    that does apply.** Note the trade — every tracked company's domain is sent to
    Google; the fallback means switching it off is deleting one function.
  - **`ApplyPrompt` is one component in two places** (the chat's match card and
    the artefact panel's posting card), and it renders only while the job is
    `saved`.
    **It is a `Dialog`, and both answers write.** Inline was the first attempt
    and it put the question below the fold of a narrow artefact panel — the
    place it is most often asked from — where it was easy to never see. A toast
    would be worse (doc 08 reserves those for events that happened; a question
    that evaporates in five seconds is asked of nobody). The question is "are
    you applying for this now?" and **"no" is not a dismissal**: someone who is
    opening a posting is keeping it, so No files under **Saved** and Yes
    under **Applied**, and the board is right either way with nothing to drag
    afterwards. No records the status the row already holds, which the domain
    treats as a no-op, so the flow view is never handed a transition that did not
    happen.
    - **The click opens the question; the answer opens the posting**
      (reversed 2026-07-29 — it used to `preventDefault` nothing and let the
      navigation through). The dialog was waiting in the tab the user had just
      left, so it was asked of a screen nobody was looking at and answered, if at
      all, by somebody who had to reconstruct the question first. Asking on the
      way out costs one click; asking after costs a context switch, which is the
      one people don't pay.
    - **A modifier or middle click is not intercepted.** That is the user asking
      the *browser* for a tab; breaking a browser affordance to run a product flow
      is not a trade this earns. The question survives — the job is still `saved`,
      so the next plain click asks it.
    - **The tab is opened by a detached `<a target="_blank" rel="noopener
      noreferrer">`, clicked inside the answer's handler before the `await`** —
      the shape `lib/download.ts` uses. Two traps in one line: a tab opened after
      a promise resolves has lost its user gesture and is blocked, and
      `window.open(url, "_blank", "noopener")` **returns `null` on success**, so
      the obvious "did it open?" check reports a blocked popup every time.
- **Blog** (doc 07/01, Phase 8): `/blog` lists posts via `@resfolio/blog/server`;
  `/blog/[id]` is the post editor (`components/blog/`). Mutations go through
  `app/(dashboard)/blog/actions.ts`.
  - **Not a `SplitWorkspace`, deliberately.** The resume and portfolio editors
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
- **Resfolio AI** (doc 13, Phases 1–7): `/ai` is a Server Component gate over
  one client island (`components/ai/`) and is now the **whole** feature —
  conversation, job match, profile enhancement, resume tailoring and cover
  letter. Everything model-facing lives in `lib/ai/`.
  - **`/ai/job` is retired (Phase 7)** and left as a `redirect("/ai")`, because
    the URL is in people's history and there is a real destination to send it to.
    The job workflow is now a **tool call inside the conversation** plus an
    artefact panel beside it — see the "Job match happens in the chat" block
    below. `PALETTE_EXTRA_ITEMS` is consequently empty: there is nothing to
    navigate to, and an entry pointing at `/ai` under a second name would be one
    destination wearing two labels.
  - **`export const maxDuration = 60` on `ai/page.tsx` is load-bearing**, and it
    moved there from `/ai/job`. `maxDuration` is route-segment config, so a
    Server Action inherits it from the page it is invoked from;
    `enhanceProfileForJobAction` and `tailorResumeAction` both take twenty-odd
    seconds, and without it the platform default kills them and it reads as a
    model failure.
  - **`lib/ai/provider.ts` is the only file in the repository that names a model
    vendor.** Everything else takes the AI SDK's `LanguageModel`. Changing
    provider or model is editing that file — do not import `@ai-sdk/openai` (or
    the gateway) anywhere else. It resolves **two credentials, gateway first**:
    `AI_GATEWAY_API_KEY` (Vercel AI Gateway) or `OPENAI_API_KEY` (direct). - The gateway needs **no extra dependency** — `ai` re-exports
    `createGateway`. Its key is passed **explicitly**, never left to the SDK's
    own ambient `AI_GATEWAY_API_KEY` lookup, or that lookup becomes a second
    `process.env` reader outside `@resfolio/env`. - **`AI_MODEL`'s format follows the key**: `openai/gpt-5-mini` through the
    gateway, `gpt-5-mini` direct. Two defaults, not one — a shared default
    404s on whichever path it wasn't written for. - **Every model call carries `providerOptions`, and a call without them is a
    bug rather than a default.** `structuredProviderOptions()` (`reasoningEffort:
"low"`) is for output the user waits on behind a blank panel;
    `chatProviderOptions()` adds `textVerbosity: "low"` for the stream. The chat
    had none at all on the theory that reasoning hides behind streaming text —
    but **the thinking happens before the first character, not behind it**:
    reasoning parts are deliberately not rendered and the SDK opens the
    assistant message immediately, so the whole budget is spent against an empty
    bubble. That is the wait `data-progress` and `aiWorking` exist to apologise
    for. `low`, never `minimal` — the chat still has to resolve an instruction
    to an item id and call a tool, and `minimal` is the setting that answers in
    prose where it should have called one. `tailorResumeAction` was missing them
    outright: the one call with **no stream and no partial output** was also the
    one running at full default effort. - **`isAiConfigured()` only proves a key exists, not that it can spend.** An
    unfunded key mounts the UI and fails mid-stream via `onError`; the client
    currently renders that as a generic "didn't go through". Making that
    legible is an outstanding fix, not a designed behaviour.
  - **The route handlers exist because a stream is the product requirement, and
    for no other reason.** Doc 06 allows a route "where the caller isn't our
    React app": `useChat` (`/api/ai/chat`) and `useObject`
    (`/api/ai/cover-letter`) need a response body that is still being written,
    which a Server Action cannot return. The letter is the clearest case in the
    feature — the output is prose, so streaming _is_ the product rather than a
    stand-in for it. **Every mutation stays a Server Action** — accepting a
    proposed change, applying tailoring, saving a transcript, saving a job.
    Neither AI route writes.
    **Phase 7 removed one rather than adding one**: `/api/ai/job` is gone,
    because the match became a tool call inside the chat's existing stream.
    `GET /api/ai/job/[id]/cover-letter` is not a replacement for it and calls no
    model — it is a **download**, taking the same exception
    `/api/resumes/[id]/pdf` does: the product need is `Content-Disposition`,
    which an action cannot return.
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
    - **`MAX_CHARS_PER_MESSAGE` _is_ `MAX_JD_CHARS`, 12,000, and that is one
      number rather than two.** A pasted posting is the largest legitimate
      message this product accepts, so any gap between the two limits is a gap in
      which the user is told one and refused by the other — which is what had
      happened: `MAX_JD_CHARS` was 20,000 and unreachable, because a posting
      arrives through the chat and the 8,000-char message limit was the real
      ceiling. 12,000 ≈ 3,000 tokens covers a verbose enterprise posting with
      benefits and legal boilerplate; past that it is a careers page pasted whole,
      and analysing it costs more, takes longer and dilutes the requirements.
    - **The composer carries no `maxLength`, deliberately.** It did, and
      `maxLength` truncates a paste _silently_ — no event, no message, nothing
      visible but a caret that stopped — so an over-long posting became a
      confident analysis of its first two-thirds. That is the exact failure
      `chat-request.ts` refuses on the server; doing it in the browser did not
      make it acceptable, it made it invisible. Enforcement is now: text stays
      whole, a counter appears at 75% (`COMPOSER_COUNTER_THRESHOLD`), and **send
      is disabled** with a sentence that names the real cause ("that's longer than
      a job posting — leave out benefits and company history"). Same copy on the
      server's 413, because a limit explained two ways is a limit users argue
      with.
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
  - **A saved transcript is re-judged before it is rendered** —
    `lib/ai/transcript.ts`'s `reconcileTranscript`, run in `ai/page.tsx` against
    the profile that page already loaded. **A stored proposal records what was
    _suggested_, never what was done with it**, so replaying it verbatim put Apply
    buttons back on changes the user accepted weeks ago; pressing one either did
    nothing or overwrote wording edited by hand since. This needed no "applied"
    column and no bookkeeping, because the domain already has the verdict:
    **`unchanged`**. It is a re-run of `reviewProfileChanges`, not a second guard.
    - **An applied change stays on screen, marked, and must keep doing so.** The
      first cut dropped it from `valid` — which fixed the button and lost the
      diff, so a conversation where you accepted six rewrites came back with no
      trace of them. The before/after _is_ the record of what was done, and it is
      the most useful thing on that screen after the fact. It keeps its **stored**
      before/after (recomputing gives "no change") and is listed in
      **`settledIndexes`**, which `ProfileProposal` seeds its `applied` set from —
      so it renders the green "Applied" marker instead of a button.
    - **`settledIndexes` is on `ProposalOutput`, an app-level widening of
      `ProfileChangeReview` in `lib/ai/tools.ts`, and belongs there.** The domain
      type describes what the guard decided about a set of changes; whether the
      user has since clicked Apply is a fact about a screen. It is optional, so
      `execute` still returns a plain review and live turns say "nothing settled"
      by omission.
    - **Three outcomes, three destinations**: applied → `valid` + `settledIndexes`;
      **stale** (item deleted, value no longer parses) → `rejected`, because an
      offer that would fail on click is worse than no offer; outstanding →
      untouched. A refusal that no longer holds becomes an offer again — the user
      added the skill, so the rewrite around it is now ordinary.
    - **Both halves go back in.** Feeding only `valid` would drop the original
      refusals, and "2 suggestions were dropped" vanishing on reload is the same
      dishonesty in the other direction.
    - **`ProfileProposal` splits `rejected` by reason**, and must keep doing so.
      `unchanged` means _already in your profile_; everything else means the guard
      **refused** it. Counting them together told users their own accepted edits
      had been rejected as fabrication. Its heading counts what is _left_
      ("2 of 6 left"), because a bare "6" over four Applied markers answers no
      question anyone has.
    - Live turns do not go through it — a proposal arriving now was reviewed
      against this same profile seconds ago inside the tool's `execute`.
  - **The enhance offer is withdrawn once a posting has caused changes, and the
    card now _says so_ (2026-07-28).** What flows
    `page` → `AiWorkspace` → `AiChat` → `AiMessage` → `JobMatchCard` is a
    `ReadonlyMap<string, JobFacts>` (`lib/ai/job-facts.ts`) — `hasEnhancement`,
    `resumeDocumentId`, `status` — not the old `Set` of enhanced ids, which
    answered one of those three questions and left the other two as the reason
    the card kept offering work it had already done.
    - **The bug was legibility, not logic.** `alreadyEnhanced` did withdraw the
      profile branch and did explain itself — but only in the sentence that
      replaced the button, and only while the profile tile was selected, which the
      same flag had just switched away from. So a reopened conversation showed a
      fully armed card with no trace of the accepted changes. **State now belongs
      on the option**, visible whichever tile is selected, with the header stating
      the overall position when everything is spent.
    - **One accepted optimisation finishes the card (2026-07-29).** `done` is a
      single flag, not one per destination: both tiles go to `aria-disabled` with
      what happened written on them, the picker and the submit disappear, and an
      "Already optimised" badge takes the button's place. Per-destination
      retirement was defensible and still read as the product having forgotten,
      because a reopened conversation showed a live button beside accepted work.
      **The trade is real and deliberate**: a resume can no longer be tailored for
      a job after the profile has been enhanced for it, from this card.
      `/resumes/[id]` still owns everything about a document.
    - **`aria-disabled`, not `disabled`, on a locked tile.** A `disabled` button
      leaves the tab order, and the tile's text is by then the entire record of
      what happened to this job — putting it somewhere a keyboard or screen-reader
      user cannot reach. The click is inert either way.
    - **Applying tailoring calls `setJobResumeAction`** (an action that had no
      caller), which is what makes "which resume was this job optimised for" a
      fact at all — and incidentally fills the artefact panel's empty resume
      picker.
    - **`SkillGaps` stays live after the lock**, and falls back to the `profile`
      destination. It is the user ticking boxes beside evidence from their own
      writing — it spends nothing, so locking it would leave terms the posting
      names unlisted for the sake of a rule about model calls. Profile is also
      right on its own terms: a term you have demonstrably used is a fact about
      your career, not an opinion held by one document.
    - **Every gap between a JSX expression and the next word in that panel is an
      explicit `{" "}`.** Written as a literal space after `}` it shipped as
      "1 termthat" and "print itand" — invisible in the source, plain in the
      product.
    - **`enhancedJobIds` was memoised on server props and never refreshed**, while
      `JobPanel` held a freshly-listed set of jobs it kept to itself. The panel now
      hands its list up through `onJobs` — no extra read, it was fetching this
      already — and `AiWorkspace` owns the list both the panel and the transcript
      answer from.
  - **One conversation covers one job, and it is enforced in two places.** A chat
    has one artefact panel, one resume slot and one score, so a second posting
    produces a conversation that is lying about which job it describes — and it is
    paid for twice over, since every turn re-reads the transcript. It also breaks
    re-checking: `findJobDescription` walks back to the *most recent* long
    message, so after a second posting lands, "recalculate" silently re-checks the
    wrong one.
    - **The composer refuses to send** (`lib/ai/second-posting.ts`, pure +
      tested), reading the transcript's own `tool-analyzeJobMatch` parts and the
      pending text: **no request, no model call**, because a detector that spent
      one would be a smaller copy of the problem. **There is no "send anyway"** —
      the server refuses too, so that button could only have meant "spend a call
      to be told no". What replaces it is "Keep editing".
    - **The tool refuses to run**, and that is the guarantee. A guard living only
      in the browser is one a sentence talks the model around; "analyse this other
      one too" is ordinary English. `AiToolContext.analysedJob` is read from the
      same transcript, so it cannot disagree with what the user sees, and the
      refusal (`unavailable: "already-analysed"`) renders in the transcript with a
      Start-a-new-chat button.
    - **A re-check of the same posting is not a second job**, and the line is
      drawn by comparing the posting rather than counting calls. `isSamePosting`
      is **shared by both guards** so they cannot draw it differently. That path
      now **reuses the existing job's id** — before it, every re-check minted a
      row with its own `initial_score`, so the "74% → 86%" comparison this whole
      feature is built on could never actually be drawn.
    - **The threshold is `MIN_JOB_DESCRIPTION_CHARS`, the same 200 the server uses
      to pick a posting out of a transcript** — one number, so this can never warn
      about a message the analysis would ignore. A **bare link** is the second way
      in, and it is required: the case that prompted this started with a URL on
      its own.
    - **The bar is the false positive.** "Enhance my summary", a re-paste of the
      same posting with the benefits trimmed, and the description that follows a
      link must all pass silently. A nudge that fires on ordinary messages is one
      users click through without reading, at which point the real one is
      invisible too. Half of `second-posting.test.ts` asserts silence.
    - **"Start a new chat with this" carries the text in memory**, not through the
      URL: the thing being carried is a job posting, and a twelve-thousand-character
      query string is not a link and would land in request logs. `AiWorkspace`
      holds the active chat id as state seeded from the prop, mints a new one, and
      `AiChat`'s existing `key` does the rest.
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
    when the _order_ changed, not because the standard was relaxed. **A phase now
    picks a bank rather than a sentence** — `PHASE_KINDS` → `WorkingText`, see the
    Motion section — and the rotation stays inside the phase the server reported,
    which is the same standard applied to the words. Three rules:
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
    segment**: `/ai/job` occupied that position when the decision was made, and
    the reasoning outlived it — a dynamic segment here makes every future static
    child an id nobody may be assigned. The transcript is loaded
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
    - **`AiWorkspace` owns which conversation is on screen; the page reports only
      what the URL says** (fixed 2026-07-29 — this was a conversation-losing bug).
      `ai/page.tsx` used to compute `saved?.id ?? randomUUID()` and key the
      workspace on it, which made the page **non-idempotent**: two renders of one
      URL produced two ids, so any re-render of the route while a chat had no
      `?c=` yet changed the key, remounted everything and dropped the user into a
      blank new chat *mid-answer*. Route re-renders are ordinary —
      `router.refresh()` after applying tailoring, **every Server Action that
      calls `revalidatePath`** (Next re-renders the current tree in the action's
      response whatever path was revalidated, so the chat's own Apply button,
      which revalidates `/profile`, did it), and Fast Refresh in development.
      - **A key could not have been made to work**, and that is the part worth
        keeping: the URL is claimed *during* a conversation — the first save
        writes `?c=<id>` via `history.replaceState` — so the server's answer for
        one unbroken chat changes from "nothing" to an id with nothing navigated
        to. Anything keyed on that remounts at the transition.
      - The rule is `lib/ai/chat-identity.ts` (pure, tested): compare the URL
        against **the URL as last seen**, never against the id on screen. `url !==
        current` is the *normal* state of an unsaved chat, not evidence of a
        navigation. Four cases — `none` (re-render), `adopted` (our own
        `replaceState` catching up), `open` (the rail), `new` (New chat).
      - **Whoever changes the URL tells the adoption block about it.**
        `startNewChat` calls `replaceState("/ai")` *and* clears the last-seen URL,
        or the next re-render reads its own edit as a navigation and mints a
        second id over the posting just carried across.
      - The new-chat id is minted in a **`useState` initialiser** (once per mount)
        instead of on the server (once per render). Nothing renders it into the
        DOM — it reaches `useChat`'s id, two `key`s and a fetch argument — so the
        server and client disagreeing across hydration changes no markup.
      - **"New chat" in the rail is a link a plain click takes over**
        (`onNew` → `startNewChat("")`). Cmd-click still opens a tab; a plain click
        no longer round-trips to the server for an id the client can mint — and
        from a chat that never saved, the URL was already `/ai`, so the navigation
        was a no-op and the button did nothing at all.
    - **Delete asks nothing, Clear history asks.** One destroys a row the user is
      pointing at; the other reaches everything scrolled out of view.
  - **Stop is a cost control.** The route passes `request.signal` as
    `abortSignal`, so cancelling actually stops generation and therefore billing.
  - **Usage is logged, not tabled** (`onFinish` → `createLogger("ai")` with
    user, model, mode, token counts). A billing meter later reads that call site.
  - **Job match happens in the chat** (doc 13's open question: answered "route,
    not chat mode" in Phase 4 and **reversed in Phase 7**). Phase 4 was right
    that one analysis is one turn and wrong that the analysis was the workflow —
    read a match, change the profile, look again, tailor a resume, write a letter
    is five turns, and `/ai/job` had ended up modelling it as three stacked
    panels under a textarea: a conversation rendered as a form. - **`analyzeJobMatch` is the chat's second tool** (`lib/ai/tools.ts`, built
    by `createAiTools`). Its **input is the analysis** — role, company,
    location, the posting's URL, requirements, keywords — so it streams as tool
    input and costs no second model call, and its **`execute` is pure**, like
    the proposal tool's: verify, demote, count, return. **The posting is not an
    input.** It is closed over from the conversation via `findJobDescription`,
    which walks back to the most recent user message long enough to be a
    posting — that is what makes "recalculate" work as a turn of its own, and
    what stops the model re-emitting 4,000 characters as arguments. - **The tool writes nothing; `JobMatchCard` does**, once, through
    `saveJobMatchAction` on a `useRef`-guarded effect. Same shape as the
    transcript's save. The job id is minted server-side inside the tool result
    and lives in the transcript, so reopening a chat re-saves the same job. - **`JobPanel` reads the database, not the transcript.** The card renders one
    tool result; the panel renders the _job_, which outlives that message and
    gains a resume and a letter afterwards. It refreshes on a **counter**
    (`jobRefresh`) rather than a callback or `router.refresh()`, because
    re-rendering the route would remount the transcript — and the letter
    someone may be mid-way through generating. - **The list and the open record are two reads, and `refresh()` must bump
    both.** Listing forty jobs must not mean loading forty postings, so the
    full record is fetched by its own effect — and every event worth
    refreshing on (a letter finishing, a resume being picked) changes _the
    record_ while leaving the list byte-identical: same ids, same order, same
    active id. Keyed on `activeId` alone that effect never re-ran, so
    `coverLetter` stayed null and `resumeDocumentId` stayed unset, and the two
    buttons conditioned on them — "Download cover letter", and an enabled
    "Download resume" — never appeared. **Both PDF downloads looked broken and
    neither route was ever called.** `reloadToken` is what re-runs it; a
    counter rather than clearing `job`, so the record does not flash back to
    its loading state while it reloads. - **Enhancement keeps per-change consent.** `enhanceProfileForJobAction`
    returns a `ProfileChangeReview` through the same `reviewProfileChanges`
    guard, rendered by the same `ProfileProposal` with only the write injected
    (`applyJobEnhancementAction`, which also records what the posting caused).
    A job asking for a rewrite changes nothing about the write path. - **The `<70%` warning is a confirmation, not a gate**, and no server code
    consults the score — the constraint is the guard, which is identical either
    way. The threshold lives in `@resfolio/job`, because it describes what a
    match _means_ and the dialog copy quotes it. It moved to `OptimiseForJob`
    with the trigger, and now fires on the **profile branch only** — see the
    optimise block below. - **The re-check is asked for, never automatic.** A new score costs a model
    call; `initial_score` is written on insert only, which is what makes
    "74% → 86%" a measurement rather than two numbers. - **Either/or requirements are one requirement, and the model says so.**
    "Build features using Angular/React and Java/Node.js" was read as four
    demands, so a profile with React and Node.js — which satisfies that sentence
    completely — was told it lacked Angular and Java. A keyword is now
    `{ term, anyOf }`: `{"term": "Angular/React", "anyOf": ["Angular",
"React"]}`, and `coverKeywords` marks it covered when **any** option is
    present, recording which one so the chip can say "Angular/React · React".
    **The split is the model's judgement, not a regex**, because a slash means
    "or" in `Angular/React` and does not in `CI/CD`, `TCP/IP`, `UI/UX` or `I/O` —
    that is reading comprehension, and no stoplist of atomic slash-terms is ever
    finished. `ALTERNATIVES_RULE` is shared by the chat tool rules and the
    standalone analysis prompt; getting it right in one and not the other gives
    one posting two answers. - **Skills the profile _demonstrates_ but does not _list_ are a separate
    surface, not a relaxed guard** (`components/ai/skill-gaps.tsx` over
    `@resfolio/profile`'s `skills.ts`). A project's `technologies` say Docker, a
    bullet says Docker, the Skills block says nothing — so the analysis reported
    "Docker ✓" above a resume that never printed it, and every existing path was
    structurally unable to fix that because the proposer was a model. Here the
    proposer is the **user**, ticking a box beside evidence drawn from their own
    writing, and the domain re-derives that evidence server-side. It offers
    nothing the profile does not already contain, so OWASP stays a gap.
    `listSkillsForJobAction` honours the same destination `OptimiseForJob` asked:
    profile → the draft, resume → a `deltas` entry carrying the **guarded**
    array, never a second growth path. - **`lib/ai/job-analysis.ts` is where every number comes from.** The model
    classifies `strong|partial|gap` and cites profile item **ids**; this file
    resolves the citations, **demotes a match whose citations resolve to
    nothing** (an unverifiable match is fabrication arriving as a score), does
    the arithmetic, and checks keyword coverage with a **word-boundary** match
    — `includes` reports that a profile saying "Google" has "Go", and telling
    someone their resume already says something it doesn't is the damaging
    direction of that error. - **`evidence` comes before `level` in the schema, deliberately.**
    Structured output is generated in schema order, so the model must find its
    support before stating a verdict. A tidy-up that alphabetised those fields
    would silently undo it; `job-analysis.test.ts` guards it. - **The page ships the item index and the context JSON, never the raw
    profile.** Keyword coverage is checked against _exactly what the model
    read_ (`AiToolContext.profileJson`, **not** `JSON.stringify(profile)`), so
    a stripped starter placeholder can't be reported as coverage. - **The pasted posting is untrusted third-party text.** In the chat it is an
    ordinary user message; in `enhanceProfileForJobAction` and
    `tailorResumeAction` it goes in delimited, never spliced into the system
    prompt. The real guarantee is structural — the model's only tools return
    objects, and every write is an action a human triggered. - **`MAX_REQUIREMENTS` is 12, down from 20, and it is a latency control.**
    Structured output is generated in one uninterrupted run before anything is
    shown, so every extra requirement is output tokens the user waits through
    behind a blank panel.
  - **Optimising for a job is ONE action with ONE question: where does it land?**
    (`components/ai/optimise-for-job.tsx`, 2026-07-28.) There used to be two peer
    buttons for one posting — "Enhance profile for this job" on the match card and
    "Tailor for this job" in the artefact panel — and they were **never the same
    action**: enhancement rewrites the Profile permanently and is therefore written
    conservatively (the wording has to still read correctly for the next posting),
    while tailoring writes overrides on one document and is therefore allowed to be
    pointed, because the canonical record survives. Nothing on screen said any of
    that, so the honest reading was "press this, then press the other one that does
    the same thing", and pressing both bought two model calls rewriting the same
    sentences — the second layered on the first, which is exactly how a resume ends
    up carrying two postings' worth of overrides and reading for neither.
    - **The fix was to merge the two _decisions_, not the two capabilities.** They
      were one question the product had never asked. `OptimiseForJob` asks it up
      front — **My profile** (permanent, every output) or **This resume only**
      (overrides on one document) — then runs exactly one of
      `enhanceProfileForJobAction` / `tailorResumeAction` and renders exactly one
      of `ProfileProposal` / `TailorReviewPanel`. One model call, one review, one
      place. Do not add a second entry point back.
    - **Ordering rides with the resume branch and has no profile equivalent**, and
      that is the data model rather than a scope cut: section and item order is a
      property of a _resume_: there is nowhere in a Profile to record "for this
      posting, lead with Projects".
    - **The `<70%` confirmation is on the profile branch only.** The rule
      (`ENHANCE_CONFIRM_THRESHOLD`, `@resfolio/job`) is about rewriting a _career
      record_ to chase a role it does not fit; pointing one document at a long shot
      is an ordinary thing to do with a document, and one Reset undoes it.
    - **Only the spent branch is withdrawn.** `alreadyEnhanced` retires the profile
      option for a posting already enhanced for; the resume option never retires,
      because pointing a second resume at the same job is a new thing to do. The
      default destination flips to the resume when the profile branch is spent.
    - **`resume-tailor.tsx` kept the review and lost the trigger.** It exports
      `TailorReviewPanel` and `TailoredNotice` (the override count + Reset, which
      moved to the resume card in `JobPanel` — it is a fact about a _document_,
      true whether or not you are looking at a job). `ResumeTailor` is gone, and so
      are `TEST_IDS.tailorPanel` / `tailorTarget` / `tailorSubmit` / `tailorError`.
  - **Resume tailoring (Phase 5) has no route handler.**
    `app/(dashboard)/ai/tailor-actions.ts` holds all three actions — the model
    call included. (It was `ai/job/actions.ts` until Phase 7 retired that route;
    the actions did not change, and the trigger now lives in `OptimiseForJob`.)
    That is doc 13's rule applied, not abandoned: **the guard needs the
    profile's content** (the growth rules compare against stored values), so the
    review must be built server-side, so the client has nothing to render as it
    arrives, so a stream would be streaming to nobody. Phase 4 could stream
    because verifying a match needed only an item index. Do not "improve" this
    into a third route.
    - **Its `maxDuration` now comes from `ai/page.tsx`** — see the top of this
      section. A Server Action inherits the segment config of the page it is
      invoked from, so retiring `/ai/job` moved that ceiling rather than removing
      the need for it.
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
      would drift on which side is the new one. Both reviews now render inside
      `OptimiseForJob` on the match card, which reads the posting off the tool
      result: a textarea of its own is the surest way to have the match and the
      optimisation disagree about which job the user meant.
    - **The page ships four fields per resume** (`TailorTarget`), not documents —
      a `ViewDefinition` in a browser bundle to answer a question about a name.
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
    - **A finished letter is now persisted (Phase 7)** — on the job match
      session, as its _parts_, not as rendered prose. That is the home Phase 6
      predicted, and it is a `job_match_sessions` column rather than a document,
      by the document domain's rule that documents carry no content fields. The
      greeting and sign-off are still composed by the platform, so what is stored
      has no field for either.
    - **The PDF is drawn by `pdf-lib`, not by Chromium** (`lib/pdf/`), and that
      is deliberately unlike the resume's export. A resume is a template —
      arbitrary CSS — so it needs a rendering engine on Fly; a letter is one
      fixed layout, so drawing it directly costs no second service, no
      `RENDER_SECRET` hop and no `PDF_EXPORT_ENABLED`. Three things not to break:
      **the fonts are vendored** (PT Serif, because it ships _static_ Bold —
      pdf-lib embeds only the default instance of a variable font, so a variable
      family gives you a bold that silently isn't); **layout is split from
      drawing** (`cover-letter-layout.ts`, pure + tested, because a line drawn
      below the bottom edge is invisible in a file somebody sends to an
      employer); and **`sanitize` is load-bearing** — pdf-lib _throws_ on a
      character the font cannot encode, so one smart quote would fail the whole
      download.
      **`coverLetterFilename` decides the file's type as far as the user is
      concerned**, so its extension defaults to `pdf` and is a parameter. It
      hardcoded `.txt` from the copy-it-out days while the PDF route used it for
      `Content-Disposition` — so the route served real PDF bytes under a `.txt`
      name, the download succeeded, and the file opened in nothing. Reported, of
      course, as "it only gives me a text file".
      **The route has a `POST` as well as a `GET`, and the client uses `POST`.**
      `GET` draws the _stored_ letter (the panel's button, and what still works
      when a conversation is reopened). `POST` draws the letter in the body — the
      one on screen. The letter reaches the database through an action fired from
      `onFinish` and the panel only sees it on its next read, so a `GET`-only
      route makes downloading a finished letter depend on a write and a refresh
      the user cannot observe. The bytes should depend on the letter, not on the
      bookkeeping around it. `POST` still resolves the job for ownership and the
      filename, still takes the signature from the profile, and re-parses the
      prose through the domain's `coverLetterSchema`.
      **The fonts are read through `path.join(process.cwd(), …)` and are traced
      anyway** — checked against a clean `next build`, the three `.ttf`s are in
      the route's `.nft.json`, so no `outputFileTracingIncludes` entry is needed.
      Worth re-checking if the loader ever moves out of `lib/`, because the
      failure mode is a production-only ENOENT on a file that is sitting in the
      repository.
      **The `.txt` fallback hides when a `jobId` is present**: the letter is
      stored, the panel offers the real PDF, and two Download buttons a few pixels
      apart meaning two different formats is how somebody sends the wrong one.
    - **A finished letter replaces the form that produced it.** `CoverLetter`
      takes `saved` — the letter stored on the job — and hides the whole compose
      card (heading, recipient field, "Write a cover letter", the it-will-be-saved
      note) whenever a letter exists, streamed or restored. What is left is the
      letter, Copy, Download and one quiet **Rewrite** that brings the form back.
      Three things this fixed or depends on:
      - **`saved` is what makes hiding possible at all.** Without it "has a
        letter" would mean "streamed one in this component's lifetime", so every
        page load would present the form again over a letter finished last week.
      - **`LetterCard` no longer owns a Download button.** It had one, gated on
        `job.coverLetter`, drawing the _stored_ letter via `GET` while the
        component below drew the _on-screen_ one via `POST` — two buttons a few
        pixels apart, same letter, different verb. `TEST_IDS.jobPanelLetterDownload`
        went with it.
      - **A restored letter renders no flag list, by construction.** The stored
        shape drops per-paragraph `evidence`, so `verifyCoverLetter` would call
        every paragraph ungrounded — the check lying about a letter that passed.
        `review` is null for a restored letter because it reads the streamed
        values, which are empty.
      - **Rewrite is not a hedge.** The form is unreachable by any other route
        once hidden, so without it a user who dislikes their first draft has no
        path at all.
  - **`lib/ai/system-prompt.ts`'s `CHANGE_LIMITS` is shared and must stay
    shared**, and so are `BULLET_FORMULA` and `PROJECT_FORMULA` beside it. Three
    workflows now emit `ProfileChange`s validated by the same domain code (chat →
    profile draft, tailoring → resume view, job enhancement → profile draft).
    Restating those lines in a second prompt guarantees one copy drifts, and the
    one that drifts is the one nobody rereads.
    - **The bullet formula is a shape, not a quota.** Handed eight numbered
      patterns a model reads them as eight bullets to write, so the count is
      disclaimed in the formula _and_ by `CHANGE_LIMITS` beside it — and the
      domain's growth rule refuses a longer `highlights` list independently.
    - **`SKILLS_RULES` is shared for the same reason and exists because every
      workflow was silently skipping the skills sections.** `CHANGE_LIMITS` states
      what is _permitted_ there (prune, reorder, recase; never add) and a rule
      about what you may not do is not an instruction to do the part you may — so
      a posting that asked for Testing and Agile produced a draft of summary and
      highlight rewrites and left the skills list in typing order, which reads as
      the feature ignoring half the analysis it just showed you. The three moves
      are real: **order** is what a six-second skim reads, **spelling** is what a
      keyword scan matches ("Node" → "Node.js" is a naming correction, not a new
      claim), **pruning** turns twenty-eight entries into eight. The last
      paragraph — you cannot add an entry, say it as a gap instead — is there
      because the on-screen "2 missing" count is exactly where a model reaches for
      one, and the domain's set-growth rule refuses it regardless.
    - **The `[result]` slot is where a metric gets invented**, so `TRUTHFULNESS`'
      no-numbers rule is restated there in the specific. A rule stated far from
      its temptation is a rule that loses.
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
  construction). Locally: start docker Postgres (host port 15432), build the
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

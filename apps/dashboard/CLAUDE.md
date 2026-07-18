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
- Blog (reserved; Phase 8)
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
no teasers**. `/domains` remains a `ComingSoon` placeholder until Phase 7, and
`/blog` is the same until Phase 8. The **design-system pass** (doc 08)
then made the app a coherent product rather than a set of screens: shared
`Page`/`PageHeader`/`EmptyState`/`SaveIndicator` primitives, the product `Card`
surface replacing the landing page's `card-surface`, motion tokens + a Framer
Motion vocabulary in `components/motion/`, and a palette that no longer
animates. **The 2026-07-17 revision** then: renamed the brand token
`accent` → `brand` and adopted **shadcn/ui as the UI foundation** (the shell is
now shadcn's `Sidebar`); rebuilt the resume experience (public/private
visibility, no tokens, Download PDF, a Sections config layer). Use current
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
    stays. `useReducedMotion()` in JS; the media query in CSS.
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
  `Sheet` with a focus trap, icon rail with tooltips, `cmd+b`. Two things not
  to break:
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
  `@resfolio/document/server`; `/resumes/[id]` loads the document + the profile
  draft and hands both to the `ResumeEditor` client island
  (`components/resume/`). The `SplitWorkspace` primitive
  (`components/workspace/`) is form-left / preview-right, reused by every
  future editor. The preview renders the **real** `resume-classic` template
  in-browser via the pure `buildProfileView` (same function the print route
  runs — that's the parity guarantee), scaled to fit with advisory page-break
  guides (`lib/resume-preview.ts`, pure + unit-tested). A resume **presents**
  a profile, it never contains one — nothing in this editor edits content; that
  is `/profile`, one click from every empty state. The left pane is three
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
    - **Default order is the template's** (`resumeClassic.defaultSectionOrder`),
      seeded into a new document by `createResumeAction` and then owned by the
      user. Nothing re-imposes it, which is why existing resumes keep the order
      they have rather than silently rearranging on deploy.
  - **Layout** — the template's own config schema (page size, **font size**,
    margins, accent, icons, **per-link visibility**). Presentation only.
    Unlike the portfolio form these controls are **hand-written**, so a new key
    in `resumeClassicConfigSchema` also needs a control here (and an entry in
    the `PAGE_SIZES`/`MARGINS`/`FONT_SIZES` tuples).
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
    It renders the **draft** (matching the preview); the public URL renders the
    **published** version — the Sharing panel says so, because people get this
    wrong.
- **Portfolio section** (doc 03/04, Phase 5): `/portfolio` reads the user's Site
  via `@resfolio/portfolio/server` (`getSiteForOwner`). No site → `PortfolioClaim`
  (slug input with live availability via `checkSlugAvailabilityAction`, template
  radio pick). Has a site → `PortfolioEditor` (`SplitWorkspace`: settings form
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
    + a real "Open live site" link) and stubs only the pane between them, so
    restoring a real preview is a swap of one component's body.
  - **A template asks only for what it genuinely can't render without.** The
    generic visibility toggles and count knobs (`showAvatar`,
    `showCommandHint`, `featuredProjectCount`, `showGithubGraph`) were removed
    from `dark-anime`: templates are opinionated (doc 03), so they decide, and
    anything genuinely absent is driven by absent *data*, not by a switch.
    Reusable visibility toggles may return as a platform concern once two
    templates want the same one — not as per-template booleans.
  - **A config field whose Zod shape is a union renders no control unless the
    template declares a `kind`.** `introCallUrl` (`"" | url`) was invisible in
    this form for exactly that reason — the template could see the setting; the
    user had no way to set it. `ConfigFieldMeta.kind` now carries `url`
    alongside `image`/`textarea`, and `config-form.test.ts` guards it.
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

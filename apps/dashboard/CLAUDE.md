# Resfolio Dashboard Application

This application powers the authenticated product experience.

Primary domain

https://app.resfolio.me

This application is responsible for

- Authentication (sign in / sign up / session)
- Profile editor (the single source of truth: role, projects, bio, skills)
- Connected sources (GitHub, Dribbble, Behance, LinkedIn, Medium)
- Portfolio theme + custom domain configuration
- Resume export
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
switch, publish) with the `apps/sites` draft-preview iframe. `/domains` remains a
`ComingSoon` placeholder until Phase 7. Use current Next.js best practices from
`node_modules/next/dist/docs/` when adding features.

## Established conventions (follow these)

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
- **Resumes editor** (doc 08/09, 4E/4F): `/resumes` reads documents via
  `@resfolio/document/server`; `/resumes/[id]` loads the document + the profile
  draft and hands both to the `ResumeEditor` client island
  (`components/resume/`). The `SplitWorkspace` primitive
  (`components/workspace/`) is form-left / preview-right, reused by every
  future editor. The preview renders the **real** `resume-classic` template
  in-browser via the pure `buildProfileView` (same function the print route
  runs — that's the parity guarantee), scaled to fit with advisory page-break
  guides (`lib/resume-preview.ts`, pure + unit-tested). A resume edits
  **presentation only** (template config); content stays at `/profile`.
  Mutations go through `app/(dashboard)/resumes/actions.ts` (thin `createAction`
  adapters over `@resfolio/document/server`). "Print view" is env-gated
  (`render.dashboard`: `PRINT_TOKEN_SECRET` + `SITES_URL`) — it mints a stored
  render token and opens the `apps/sites` print route.
- **Portfolio section** (doc 03/04, Phase 5): `/portfolio` reads the user's Site
  via `@resfolio/portfolio/server` (`getSiteForOwner`). No site → `PortfolioClaim`
  (slug input with live availability via `checkSlugAvailabilityAction`, template
  radio pick). Has a site → `PortfolioEditor` (`SplitWorkspace`: settings form
  left, draft-preview iframe right). The config form is **schema-driven** —
  `lib/config-form.ts`'s `describeConfigSchema` introspects the template's
  `configSchema` into field descriptors (`ConfigFields` renders them), so a new
  config option never touches the dashboard. Config is **content/visibility only**
  — the portfolio templates are opinionated and own all styling (doc 03), so the
  form surfaces toggles/counts, not color/theme pickers. `lib/portfolio-templates.ts`
  is the pick/config registry (mirrors the `apps/sites` render registry). Autosave
  persists config + discoverable; a **template switch** resets config to the new
  template's defaults (URLs are unaffected — routes are platform-owned) and the
  editor **remounts** on the template `key` (the `router.refresh()` after a switch
  is a soft refresh that would otherwise keep stale client state). **Publish** is
  gated on `SiteRecord.hasUnpublishedChanges` (+ the version pin), so it disables
  when the live page is already up to date and re-enables on any presentation
  edit; it calls `publishSite` then `apps/sites`'s `/api/revalidate`. The
  preview iframe re-mints a `@resfolio/portfolio/token` URL after each save (env-
  gated like print view). Mutations go through `app/(dashboard)/portfolio/actions.ts`.
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
  Instrument Serif / Manrope / JetBrains Mono, semantic tokens,
  `card-surface` classes). Imported in `app/globals.css` after
  `tailwindcss`; fonts are loaded in `app/layout.tsx` via `next/font` with
  the CSS variables the tokens expect.
- `@resfolio/ui` — cross-app UI primitives (shadcn/ui pattern: cva variants
  themed by design tokens). `Button`, `Input`, `Textarea`, `Label`, `Select`,
  `Checkbox`, `Switch`, `Card`, plus `Dialog`/`Command`/`DropdownMenu`. **Prefer
  a primitive over a raw HTML control** — the editors use these, not bare
  `<select>`/`<input>`. Import from `"@resfolio/ui"` only — never internal
  paths. `app/globals.css` carries `@source "../../../packages/ui/src";` so
  Tailwind scans the package's classes; keep it if you move the CSS file.
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

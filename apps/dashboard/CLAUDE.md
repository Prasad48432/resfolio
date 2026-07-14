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

Phase 2 is built: auth (Better Auth via `@resfolio/auth`), the app shell
(sidebar + top bar + `cmd+k` palette), and Settings → account with linked
accounts. Feature routes (`/profile`, `/resumes`, `/portfolio`, `/domains`)
are `ComingSoon` placeholders until their phases land. Use current Next.js
best practices from `node_modules/next/dist/docs/` when adding features.

## Established conventions (follow these)

- **Route groups**: `(auth)` = minimal-chrome public screens (`/login`);
  `(dashboard)` = everything behind `requireSession` (its layout verifies
  the session server-side and renders `AppShell`).
- **Route guarding is three layers deep** (doc 10): `proxy.ts` does an
  _optimistic_ cookie-presence redirect (never trusted), the `(dashboard)`
  layout verifies via `requireSession`, and every Server Action resolves
  the session itself through the action helper.
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
  themed by design tokens). Import from `"@resfolio/ui"` only — never
  internal paths. `app/globals.css` carries
  `@source "../../../packages/ui/src";` so Tailwind scans the package's
  classes; keep it if you move the CSS file.
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

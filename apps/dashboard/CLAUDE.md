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

This app is currently a scaffold only — a placeholder page and the shared
tooling conventions (TypeScript, ESLint, Next.js App Router). No dashboard
functionality has been built yet. Treat anything beyond `app/layout.tsx` and
`app/page.tsx` as a green field: there is no existing pattern to preserve here,
so use current Next.js best practices from `node_modules/next/dist/docs/` when
adding real features.

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

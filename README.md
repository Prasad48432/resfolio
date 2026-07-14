# Resfolio

Resfolio is a **Career OS**: users maintain one professional profile that
powers resumes, portfolios, public websites, PDFs, and future career assets.
One Profile → Many Outputs — everything stays synchronized.

This monorepo contains the complete platform (Turborepo + pnpm workspaces).

## Getting started

```bash
pnpm install
pnpm dev          # web on :3000, dashboard on :3001
```

Local infrastructure (Postgres on host port **5433** + Redis, needed from
Phase 2 on) and the dashboard's env:

```bash
docker compose -f docker-compose.dev.yml up -d
cp apps/dashboard/.env.example apps/dashboard/.env.local   # then fill it in
pnpm --filter @resfolio/database db:migrate                # needs DATABASE_URL
```

All checks, exactly as CI runs them:

```bash
pnpm format:check
pnpm turbo lint typecheck test build
```

## Workspace map

| Path                                                   | What it is                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/web`                                             | Public marketing site — [resfolio.me](https://resfolio.me)                       |
| `apps/dashboard`                                       | Authenticated product dashboard — app.resfolio.me                                |
| `apps/sites`                                           | Multi-tenant portfolio renderer (planned, Phase 4–5)                             |
| `packages/design`                                      | The design system: Tailwind v4 `@theme` tokens, base styles (CSS-only)           |
| `packages/ui`                                          | Shared UI primitives (shadcn/ui pattern; import from the package root)           |
| `packages/env`                                         | Validated environment access — the only code allowed to read `process.env`       |
| `packages/database`                                    | Drizzle client + schema + migrations over Postgres (the system of record)        |
| `packages/auth`                                        | Better Auth: Google + GitHub social login, sessions, account linking             |
| `packages/observability`                               | Pino logging (redacted) + Sentry wiring                                          |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling presets                                                           |
| `domains/`                                             | Business logic packages (planned, Phase 3+) — the reusable core                  |
| `templates/`                                           | Resume & portfolio templates behind the Template SDK (planned, Phase 4+)         |
| `docs/`                                                | **Source of truth for architecture** — start at [docs/README.md](docs/README.md) |

## How this repo is driven

- Architecture is decided in [docs/architecture/01–12](docs/README.md); code
  follows the documents, and changes to a decision update the document in
  the same PR.
- Implementation proceeds in phases per
  [docs/DEVELOPMENT-PLAN.md](docs/DEVELOPMENT-PLAN.md).
- Conventions live in [CLAUDE.md](CLAUDE.md) (root) and per-app
  `CLAUDE.md` files — read the nearest one before changing anything.

## Conventions in one breath

pnpm only (never npm/yarn) · `@resfolio/*` workspace scope · TypeScript
strict · named exports · Server Components by default · Zod at every
boundary · business logic in `domains/`, never in apps · import packages by
their public API only · Conventional Commits.

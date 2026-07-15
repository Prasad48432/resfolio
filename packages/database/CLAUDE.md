# @resfolio/database

Drizzle client + schema + committed migrations over Postgres — the system of
record (docs/architecture/07-storage.md). Consumed only by domains and the
Better Auth setup; apps never query it directly.

## Schema conventions

- **`src/schema/auth.ts` is generated** by the Better Auth CLI (`pnpm
--filter @resfolio/auth db:generate-schema`) and committed — never
  hand-edited or hand-linted (it's in the eslint/lint ignore list). Its
  timestamps are `timestamp` (no tz) because that's the generator's output;
  leave them.
- **Hand-authored tables use `timestamptz`** (`timestamp("…", { withTimezone:
true })`) for every instant, so times are unambiguous across
  environments — see `schema/profiles.ts`. Use JSONB for schema-in-code
  documents (guarded by a domain Zod schema + `schemaVersion`); relational
  columns for anything you look up, join, or enforce (doc 07).
- One schema module per concern in `src/schema/`, re-exported from
  `schema/index.ts`. Product tables land with their feature, never
  speculatively.

## Migrations

- Generate with `pnpm --filter @resfolio/database db:generate` after a schema
  change; **commit** the SQL + `meta/` snapshot. Apply with `db:migrate`.
- CI/e2e apply migrations via `db:migrate` (e2e global-setup runs it before
  the suite); production runs it as a pre-deploy step (doc 11). Migrations
  are never applied implicitly at runtime.
- Local dev Postgres is `docker-compose.dev.yml` on **host port 5433** (5432
  is left free for a native install).

## Connection

One `pg.Pool` per process, cached on `globalThis` outside production to
survive HMR. Serverless sizing (pool max / a pooled connection string) is
tied to the managed-host choice (doc 07 open question) — revisit when the
host is picked, before query volume grows.

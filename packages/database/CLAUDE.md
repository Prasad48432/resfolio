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
- Local dev Postgres is `docker-compose.dev.yml` on **host port 15432** (5432
  is left free for a native install; 5433 is unusable on Windows, where
  Hyper-V/WinNAT reserves the 5433-5532 range — `netsh interface ipv4 show
excludedportrange protocol=tcp`).

## Connection

One `pg.Pool` per process, cached on `globalThis` outside production to
survive HMR. **The host is Neon** and the serverless sizing question doc 07
deferred is now decided — see
`docs/architecture/15-production-readiness.md` §2.1.

- **`max` defaults to 1**, not `pg`'s 10. On a serverless host every concurrent
  invocation is its own process with its own pool, so a `max` sized for a
  long-lived multi-request server multiplies by instance count against the
  database's global cap. Twenty concurrent requests at the default is two
  hundred connections. Override with `DATABASE_POOL_MAX` — and it **should** be
  raised to a small number (never back to 10) if Vercel Fluid Compute is
  enabled, since that multiplexes concurrent invocations onto one instance.
- **Two connection strings.** `DATABASE_URL` is the **pooled** endpoint (Neon's
  `-pooler` host) and is what the app uses. `DATABASE_URL_DIRECT` is the
  **direct** endpoint and is what `drizzle.config.ts` uses, because a migration
  is multi-statement DDL under session-level locks and a transaction-mode
  pooler does not hold a session across statements. It is optional and falls
  back to `DATABASE_URL`, so local docker and CI need neither.
- **Transaction-mode pooling forecloses session state** — no `SET`, no
  `LISTEN`, no server-side prepared statements. Nothing here uses any of them
  today; keep it that way, because the failure is at runtime under load rather
  than at compile time.
- The pool has an `error` listener. An `EventEmitter` `error` with no listener
  **throws**, so an idle connection dropped by the pooler (or by a Neon compute
  suspending) would otherwise take the process down for an event needing no
  action.
- **Neon scale-to-zero** means the first query after an idle period pays a
  compute resume of a few hundred milliseconds. Frequently misdiagnosed as a
  slow application; `connectionTimeoutMillis` is set to 10s to absorb it.

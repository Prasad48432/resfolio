import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env";
import * as schema from "./schema";

/**
 * One `pg.Pool` per process (docs/architecture/15-production-readiness.md §2.1).
 *
 * Next.js dev re-evaluates modules on HMR, which would otherwise leak a pool
 * per reload — cache it on `globalThis` outside production (the standard
 * Drizzle/Next pattern). Note the cache deliberately does **not** apply in
 * production and would not help there anyway: on a serverless host every
 * concurrent invocation is a separate process with its own module registry, so
 * there is nothing to share it with.
 *
 * That last point is the whole reason `max` is set below. See the
 * `DATABASE_POOL_MAX` documentation in `@resfolio/env` for why the `pg` default
 * of 10 is the wrong shape here rather than merely a large number.
 */
const globalForDb = globalThis as unknown as { resfolioPgPool?: Pool };

/** One request per process means one connection. Overridable, because the
 * correct value follows the compute model and that is a deployment decision. */
const DEFAULT_POOL_MAX = 1;

/**
 * Fail rather than hang when the pooler has nothing to give.
 *
 * With no timeout, `pg` waits forever for a connection — so a saturated pool
 * turns into requests that never resolve and a function that is eventually
 * killed by the platform with no error to look at. Ten seconds is long enough
 * to absorb a Neon compute resuming from scale-to-zero (a few hundred
 * milliseconds) and short enough to surface as a real, logged failure.
 */
const CONNECTION_TIMEOUT_MS = 10_000;

/** Hand idle connections back rather than holding them for the life of a warm
 * function. Behind a transaction-mode pooler, reconnecting is cheap and holding
 * is what exhausts the ceiling. */
const IDLE_TIMEOUT_MS = 10_000;

const pool =
  globalForDb.resfolioPgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX ?? DEFAULT_POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.resfolioPgPool = pool;
}

/**
 * A pool emits `error` for a connection that dies while **idle** — a pooler
 * recycling it, a network blip, a Neon compute suspending. Node's default
 * handling for an `EventEmitter` `error` with no listener is to **throw**,
 * which on a server means the process goes down for an event that required no
 * action at all. Logging and continuing is the documented `pg` posture.
 */
pool.on("error", (error) => {
  console.error("[database] idle client error", error);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

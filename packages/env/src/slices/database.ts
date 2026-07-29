import { z } from "zod";

/**
 * Postgres connection (docs/architecture/07-storage.md,
 * docs/architecture/15-production-readiness.md §2.1).
 *
 * **Two URLs, and both are needed on a serverless host.** The runtime connects
 * through a transaction-mode connection pooler (Neon's `-pooler` endpoint);
 * migrations cannot, because transaction pooling does not hold a session across
 * statements and a migration is multi-statement DDL under session-level locks.
 * Pointing `drizzle-kit` at the pooled endpoint produces failures that read as
 * a broken migration rather than a broken connection string, which is why the
 * split is expressed here rather than left to whoever configures the host.
 *
 * `DATABASE_URL_DIRECT` is **optional and falls back to `DATABASE_URL`**, so
 * local docker and CI — which have no pooler and need no split — are unchanged.
 */
export const database = {
  server: {
    /** The runtime connection. On a managed host this is the **pooled**
     * endpoint; locally it is just the database. */
    DATABASE_URL: z.string().url(),

    /** The migration connection — the **direct**, unpooled endpoint. Absent
     * means "same as `DATABASE_URL`", which is correct anywhere with no pooler
     * in front. */
    DATABASE_URL_DIRECT: z.string().url().optional(),

    /**
     * Connections **per process**, not in total.
     *
     * `pg` defaults to 10, which is sized for a long-lived server handling many
     * concurrent requests. A serverless function is the opposite: each
     * concurrent invocation is its own process handling one request, so nine of
     * those ten connections are idle by construction while still counting
     * against the database's global cap. Twenty concurrent requests at the
     * default is two hundred connections, and exhaustion presents as a
     * product-wide outage rather than as a problem with whatever caused it.
     *
     * Left configurable rather than hardcoded because **the right value follows
     * the compute model**: 1 is correct while one invocation means one process,
     * and a small number (still not 10) becomes correct under Vercel Fluid
     * Compute, which multiplexes concurrent invocations onto one instance. That
     * is a deployment setting, so this is one too.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(20).optional(),
  },
} as const;

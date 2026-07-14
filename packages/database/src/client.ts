import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env";
import * as schema from "./schema";

/**
 * One pg Pool per process. Next.js dev re-evaluates modules on HMR, which
 * would otherwise leak a pool per reload — cache it on globalThis outside
 * production (the standard Drizzle/Next pattern).
 */
const globalForDb = globalThis as unknown as { resfolioPgPool?: Pool };

const pool =
  globalForDb.resfolioPgPool ??
  new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") {
  globalForDb.resfolioPgPool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;

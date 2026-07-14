import { z } from "zod";

/**
 * Postgres connection (docs/architecture/07-storage.md). One URL — Drizzle
 * keeps the host portable (local docker, Neon, Supabase, RDS).
 */
export const database = {
  server: {
    DATABASE_URL: z.string().url(),
  },
} as const;

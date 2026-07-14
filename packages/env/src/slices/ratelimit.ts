import { z } from "zod";

/**
 * Upstash Redis for rate limiting (docs/architecture/07-storage.md — Redis
 * is cache/coordination, never truth). Both vars optional as a pair: absent
 * in local dev and CI, where rate limiting is inert by design; present in
 * production. Code must check both before constructing a client.
 */
export const ratelimit = {
  server: {
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  },
} as const;

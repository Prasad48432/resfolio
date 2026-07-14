import { Redis } from "@upstash/redis";

import { env } from "./env";

export interface RateLimitEntry {
  key: string;
  count: number;
  lastRequest: number;
}

export interface RateLimitStorage {
  get: (key: string) => Promise<RateLimitEntry | undefined>;
  set: (
    key: string,
    value: RateLimitEntry,
    update?: boolean | undefined,
  ) => Promise<void>;
}

const KEY_PREFIX = "rate-limit:auth:";
// Counters outlive any configured window comfortably, then expire — Redis
// data stays expendable (docs/architecture/07-storage.md).
const TTL_SECONDS = 60 * 10;

/**
 * Upstash-backed storage for Better Auth's rate limiter. Returns undefined
 * when Upstash isn't configured (local dev, CI) — Better Auth then falls
 * back to its in-memory store, which is fine everywhere except real
 * multi-instance production traffic.
 */
export function createRateLimitStorage(): RateLimitStorage | undefined {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return undefined;
  }
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return {
    async get(key) {
      const value = await redis.get<RateLimitEntry>(`${KEY_PREFIX}${key}`);
      return value ?? undefined;
    },
    async set(key, value) {
      await redis.set(`${KEY_PREFIX}${key}`, value, { ex: TTL_SECONDS });
    },
  };
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

import {
  JOB_RATE_LIMIT_REQUESTS,
  LETTER_RATE_LIMIT_REQUESTS,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW,
  TAILOR_RATE_LIMIT_REQUESTS,
} from "./limits";

/**
 * Redis-backed rate limiting for the AI endpoints
 * (docs/architecture/06-api-architecture.md — "rate limiting on sensitive
 * actions via Upstash Redis"; doc 13).
 *
 * This is the first *application* limiter in the repo. @resfolio/auth has had
 * one since Phase 2, but it is Better Auth's own, scoped to sign-in — it does
 * not generalise, and reaching into it from here would couple the AI layer to
 * the auth package's internals. Same Redis, separate key namespace.
 *
 * **The limit is per user, not per IP.** Every AI route runs behind
 * `requireSession`, so there is always a real identity to key on, and it is the
 * identity the cost is attributable to. IP keying would punish a shared network
 * and be trivially escaped by anyone it was aimed at.
 *
 * **Inert without Upstash**, exactly like the auth limiter: absent credentials
 * mean local dev and CI don't need a Redis to run the feature. That is a real
 * trade — an unlimited endpoint in any environment that forgets to configure it
 * — and it is why `OPENAI_API_KEY` is the gate that actually stops spend. An
 * environment with a key and no Redis is a misconfiguration worth catching in
 * review; both are set in production.
 */

/**
 * The modes with their own budget, and what each is worth.
 *
 * **A mode is a real budget, not a key prefix.** One job analysis sends a job
 * description and the whole profile and asks for structured output over both,
 * which is several chat turns in one click — so the two cannot share a number
 * without the chat limit being annoying or the analysis limit being expensive.
 *
 * `tailor` is counted apart from `job` for a product reason rather than a cost
 * one: they cost about the same, but they are two separate clicks on the same
 * screen, and a user who analysed a posting has not thereby spent their ability
 * to tailor a resume for it. `letter` is tighter than both, because it is the one
 * output people reroll rather than accept (`limits.ts`).
 */
const MODE_BUDGETS = {
  chat: RATE_LIMIT_REQUESTS,
  job: JOB_RATE_LIMIT_REQUESTS,
  tailor: TAILOR_RATE_LIMIT_REQUESTS,
  letter: LETTER_RATE_LIMIT_REQUESTS,
} as const;

export type AiMode = keyof typeof MODE_BUDGETS;

/** A sliding window, not a fixed one: a fixed window lets a user spend the
 * whole budget in the last second of one window and the whole budget again in
 * the first second of the next, which is the burst it is supposed to stop. */
function createLimiter(mode: AiMode): Ratelimit | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(MODE_BUDGETS[mode], RATE_LIMIT_WINDOW),
    prefix: "rate-limit:ai",
    // Counting is fire-and-forget past the decision point; the caller already
    // has its answer and shouldn't wait on the write.
    analytics: false,
  });
}

// Module scope, so one Redis client is shared across requests in a warm
// function instead of being rebuilt per call. One limiter per mode, because a
// `Ratelimit` carries its own window and budget — the mode cannot be a
// parameter to `limit()`.
const limiters = new Map<AiMode, Ratelimit | null>();

function limiterFor(mode: AiMode): Ratelimit | null {
  if (!limiters.has(mode)) {
    limiters.set(mode, createLimiter(mode));
  }
  return limiters.get(mode) ?? null;
}

export interface RateLimitVerdict {
  ok: boolean;
  /** Seconds until the caller may retry — the `Retry-After` header's value.
   * Zero when allowed. */
  retryAfterSeconds: number;
}

const ALLOWED: RateLimitVerdict = { ok: true, retryAfterSeconds: 0 };

/**
 * The key a user's AI budget is counted under. Exported (and pure) so the
 * namespacing is testable without a Redis: `mode` keeps the job-analysis budget
 * separate from chat, since one analysis costs many chat turns.
 */
export function rateLimitKey(userId: string, mode: AiMode): string {
  return `${mode}:${userId}`;
}

export async function checkAiRateLimit(
  userId: string,
  mode: AiMode,
): Promise<RateLimitVerdict> {
  const limiter = limiterFor(mode);
  if (!limiter) {
    return ALLOWED;
  }
  const { success, reset } = await limiter.limit(rateLimitKey(userId, mode));
  if (success) {
    return ALLOWED;
  }
  // `reset` is an epoch-ms instant; the header wants a duration. Floor at 1 so
  // a sub-second remainder never renders as "retry after 0 seconds".
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}

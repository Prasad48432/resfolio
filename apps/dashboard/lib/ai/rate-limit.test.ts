import { describe, expect, it } from "vitest";

import { checkAiRateLimit, rateLimitKey } from "./rate-limit";

/**
 * These run without Upstash credentials — which is the point of one of them.
 * The suite is deliberately about the *fallback* and the key namespace, the two
 * behaviours that are invisible in production and therefore only ever verified
 * here.
 */

describe("rateLimitKey", () => {
  it("namespaces by mode so one budget can't spend another's", () => {
    // A job analysis costs many chat turns; sharing a counter would let a burst
    // of chat lock a user out of the expensive workflow they actually came for.
    expect(rateLimitKey("user-1", "chat")).not.toBe(
      rateLimitKey("user-1", "job"),
    );
  });

  it("separates users within a mode", () => {
    expect(rateLimitKey("user-1", "chat")).not.toBe(
      rateLimitKey("user-2", "chat"),
    );
  });
});

describe("checkAiRateLimit", () => {
  it("allows every request when Upstash isn't configured", async () => {
    // Local dev and CI have no Redis; the limiter has to be inert rather than
    // closed, or the feature would be untestable outside production. Spend is
    // gated by OPENAI_API_KEY, which those environments also lack.
    const verdict = await checkAiRateLimit("user-1", "chat");

    expect(verdict).toEqual({ ok: true, retryAfterSeconds: 0 });
  });

  it("is inert for every mode, not just the first one asked for", async () => {
    // The limiters are memoised per mode; a cache that returned the chat
    // limiter for every key would make the job budget silently the chat one.
    expect(await checkAiRateLimit("user-1", "job")).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });
  });
});

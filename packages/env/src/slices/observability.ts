import { z } from "zod";

/**
 * Sentry + Pino (docs/architecture/11-engineering-foundation.md). DSNs are
 * optional — absent locally and in CI, where error reporting is a no-op.
 */
export const observability = {
  server: {
    SENTRY_DSN: z.string().url().optional(),
    // Injected by Next.js per runtime — read here so instrumentation files
    // can branch on it without touching process.env.
    NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal"])
      .default("info"),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
} as const;

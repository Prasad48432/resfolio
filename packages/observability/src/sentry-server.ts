import * as Sentry from "@sentry/nextjs";

import { env } from "./env";

/**
 * Server-side Sentry init — call from an app's `instrumentation.ts`
 * (Node.js runtime). No DSN configured (local dev, CI) means Sentry stays
 * a no-op; captureError below is then free to call unconditionally.
 */
export function initSentryServer(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Profile content and PII never leave the process (doc 11): Sentry gets
    // errors + request metadata, not bodies.
    sendDefaultPii: false,
  });
}

/**
 * Report an *unexpected* failure (docs/architecture/06-api-architecture.md:
 * expected ActionResult errors are not noise-reported). Safe to call when
 * Sentry is uninitialized — it no-ops.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

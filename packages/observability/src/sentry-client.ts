import * as Sentry from "@sentry/nextjs";

import { env } from "./env";

/**
 * Browser-side Sentry init — call from an app's
 * `instrumentation-client.ts`. No-op without a public DSN.
 */
export function initSentryClient(): void {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

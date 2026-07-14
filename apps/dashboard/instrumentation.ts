import type { Instrumentation } from "next";

import { env } from "@/lib/env";

/**
 * Server-side observability wiring (docs/architecture/11-engineering-foundation.md):
 * redacted Pino logging + Sentry, both no-ops without configuration.
 */
export async function register() {
  if (env.NEXT_RUNTIME === "nodejs") {
    const { configureLogging, initSentryServer } =
      await import("@resfolio/observability");
    configureLogging({
      level: env.LOG_LEVEL,
      pretty: env.NODE_ENV === "development",
    });
    initSentryServer();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  }
};

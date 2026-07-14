/**
 * @resfolio/observability — one thin package, three concerns
 * (docs/architecture/11-engineering-foundation.md): Pino logging with
 * redaction, Sentry error capture, and (later, with publish/export events)
 * PostHog product analytics. Server-side entry point; browser Sentry init
 * lives in the `./sentry-client` export.
 */
export {
  configureLogging,
  createLogger,
  type Logger,
  type LoggerOptions,
} from "./logger";
export { initSentryServer, captureError } from "./sentry-server";

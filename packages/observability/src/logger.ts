import {
  pino,
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions as PinoOptions,
} from "pino";

/**
 * Redaction (docs/architecture/11-engineering-foundation.md): emails,
 * tokens/secrets, cookies, and profile content never reach log output.
 * Pino wildcard paths cover one nesting level; log call sites keep
 * sensitive objects shallow by convention.
 */
const REDACT_PATHS = [
  "email",
  "*.email",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "idToken",
  "*.idToken",
  "secret",
  "*.secret",
  "password",
  "*.password",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  "profile",
  "*.profile",
  "draft",
  "*.draft",
];

export interface LoggerOptions {
  level?: string;
  pretty?: boolean;
  /** Test seam: write to an in-memory stream instead of stdout. */
  destination?: DestinationStream;
}

export type Logger = PinoLogger;

function buildLogger(options: LoggerOptions): Logger {
  const base: PinoOptions = {
    level: options.level ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  };
  if (options.destination) {
    return pino(base, options.destination);
  }
  if (options.pretty) {
    return pino({
      ...base,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }
  return pino(base);
}

let rootLogger: Logger | undefined;
let rootOptions: LoggerOptions = {};

/**
 * Set process-wide logger options once at app startup (level from the
 * validated env, pretty transport in dev). Must run before the first
 * `createLogger` call; later calls are ignored.
 */
export function configureLogging(options: LoggerOptions): void {
  if (!rootLogger) {
    rootOptions = options;
  }
}

/**
 * `createLogger(scope)` — one child logger per module/feature, every line
 * carrying `{ scope }`. Server-side only.
 */
export function createLogger(scope: string, options?: LoggerOptions): Logger {
  if (options) {
    // Explicit options (tests) get an isolated instance.
    return buildLogger(options).child({ scope });
  }
  rootLogger ??= buildLogger(rootOptions);
  return rootLogger.child({ scope });
}

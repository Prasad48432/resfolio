import { createAppEnv, integrations, sharedRuntime } from "@resfolio/env";

/**
 * The integrations runtime's own env (docs/architecture/11): the optional
 * AES-256-GCM token key. Optional by design — every V1 connector is `public`
 * and stores no credentials, so the platform must run without it; the
 * repository throws `TokenKeyMissingError` only when a token would actually
 * be stored.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...integrations.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

/**
 * The platform-wide token for `connectorId`, if this deployment configured
 * one. **Not authentication** — it grants no per-user access and no
 * connection depends on it; it only lifts a provider's anonymous rate limit
 * (GitHub: 60 req/hr per IP → 5,000). A connector never learns it exists:
 * `FetchContext` already promises a pre-authenticated fetch, so this is
 * runtime infrastructure, not a connector concern.
 *
 * Deliberately an explicit map rather than a `serverTokenEnv` name declared
 * on the connector: `@resfolio/env` is the only sanctioned reader of
 * `process.env` (doc 11), so a string-keyed `process.env[name]` lookup in the
 * runtime would break that rule and leak an env var name into the pure root.
 */
export function serverTokenFor(connectorId: string): string | null {
  switch (connectorId) {
    case "github":
      return env.GITHUB_TOKEN ?? null;
    default:
      return null;
  }
}

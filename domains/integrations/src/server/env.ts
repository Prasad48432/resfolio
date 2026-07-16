import { createAppEnv, integrations, sharedRuntime } from "@resfolio/env";

/**
 * The integrations runtime's own env (docs/architecture/11): the optional
 * AES-256-GCM token key. Optional by design — `public`/`file` connectors
 * (RSS today) store no credentials and must run without it; the repository
 * throws `TokenKeyMissingError` only when a token would actually be stored.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...integrations.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

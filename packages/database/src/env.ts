import { createAppEnv, database, sharedRuntime } from "@resfolio/env";

/**
 * The database package validates its own configuration on import, so any
 * consumer (app, CLI, job) fails fast on a missing/malformed DATABASE_URL.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...database.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

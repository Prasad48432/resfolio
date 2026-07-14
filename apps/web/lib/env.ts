import { createAppEnv, sharedRuntime } from "@resfolio/env";

/** Marketing site env — nothing beyond the shared runtime yet. */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

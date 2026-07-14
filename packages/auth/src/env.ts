import { auth, createAppEnv, ratelimit, sharedRuntime } from "@resfolio/env";

export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...auth.server,
    ...ratelimit.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

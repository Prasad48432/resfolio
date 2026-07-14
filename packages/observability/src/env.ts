import { createAppEnv, observability, sharedRuntime } from "@resfolio/env";

export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...observability.server,
  },
  client: {
    ...observability.client,
  },
  experimental__runtimeEnv: {
    // Client vars must be referenced literally so Next can inline them at
    // build time — this is part of the sanctioned @resfolio/env mechanism,
    // not an ad-hoc process.env read.
    // eslint-disable-next-line no-restricted-properties
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});

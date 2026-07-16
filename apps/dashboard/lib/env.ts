import {
  createAppEnv,
  observability,
  render,
  sharedRuntime,
} from "@resfolio/env";

/**
 * Dashboard app env — only the slices this app reads directly.
 * Auth/database vars are validated by @resfolio/auth and
 * @resfolio/database on their own import. `render.dashboard` (optional) powers
 * the "Open print view" affordance on resumes — absent, it's simply hidden.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...observability.server,
    ...render.dashboard,
  },
  client: {
    ...observability.client,
  },
  experimental__runtimeEnv: {
    // Client vars must be referenced literally so Next can inline them at
    // build time — part of the sanctioned @resfolio/env mechanism.
    // eslint-disable-next-line no-restricted-properties
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});

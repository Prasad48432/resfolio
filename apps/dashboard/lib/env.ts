import {
  blog,
  createAppEnv,
  observability,
  r2,
  render,
  sharedRuntime,
} from "@resfolio/env";

/**
 * Dashboard app env — only the slices this app reads directly.
 * Auth/database vars are validated by @resfolio/auth and
 * @resfolio/database on their own import. `render.dashboard` (optional) powers
 * the resume PDF download — absent, that affordance is simply hidden.
 *
 * `R2_PUBLIC_BASE_URL` is read here purely by `next.config.ts`, which needs the
 * bucket's hostname for `images.remotePatterns` and the CSP `img-src`. The
 * upload path itself never reads env from this app — `@resfolio/storage`
 * validates its own. Deriving the host from the same variable that builds the
 * URLs is what stops the two from disagreeing: a hard-coded hostname works
 * until the first deployment that points at a different bucket, and then every
 * uploaded image silently 404s through the optimizer.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...observability.server,
    ...render.dashboard,
    ...blog.server,
    R2_PUBLIC_BASE_URL: r2.server.R2_PUBLIC_BASE_URL,
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

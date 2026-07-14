/**
 * @resfolio/env — the only place in the repository that reads process.env.
 *
 * Pattern (docs/architecture/11-engineering-foundation.md):
 * - One schema slice per concern lives in `src/slices/` (database, auth,
 *   redis, r2, observability, …). Slices are added with the feature that
 *   needs them — never speculatively.
 * - Each app composes exactly the slices it needs into its own `env.ts`
 *   via `createAppEnv`, so a missing or malformed variable fails the build,
 *   not a request at 2am.
 * - Everywhere else, `process.env` is banned by ESLint
 *   (`no-restricted-properties` in @resfolio/eslint-config).
 */
export { createAppEnv } from "./create-app-env";
export { sharedRuntime } from "./slices/shared";
export { database } from "./slices/database";
export { auth } from "./slices/auth";
export { ratelimit } from "./slices/ratelimit";
export { observability } from "./slices/observability";

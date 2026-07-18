import { createAppEnv, r2 } from "@resfolio/env";

/**
 * This package composes its own R2 slice (docs/architecture/11-engineering-foundation.md):
 * packages validate the variables they use rather than accepting them as
 * arguments from every app that happens to call them. `@resfolio/env` is the
 * only sanctioned reader of `process.env`; everywhere else it is banned by
 * ESLint.
 */
export const env = createAppEnv({
  server: { ...r2.server },
  experimental__runtimeEnv: {},
});

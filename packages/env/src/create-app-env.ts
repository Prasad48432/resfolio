import { createEnv } from "@t3-oss/env-nextjs";

type EnvOptions = Parameters<typeof createEnv>[0];

/**
 * Thin wrapper over @t3-oss/env-nextjs with repository-wide defaults.
 * Apps call this from their own `env.ts`, spreading in the slice schemas
 * they consume:
 *
 * ```ts
 * import { createAppEnv } from "@resfolio/env";
 * import { database } from "@resfolio/env/slices"; // future slices
 *
 * export const env = createAppEnv({
 *   server: { ...database.server },
 *   client: {},
 *   experimental__runtimeEnv: {},
 * });
 * ```
 */
export function createAppEnv<T extends EnvOptions>(options: T) {
  return createEnv({
    // Platform dashboards often store unset optional vars as "" — treat
    // them as absent so `.optional()` behaves as expected.
    emptyStringAsUndefined: true,
    ...options,
  });
}

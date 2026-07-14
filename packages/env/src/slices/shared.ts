import { z } from "zod";

/**
 * Variables every app shares. Kept deliberately tiny; concern-specific
 * slices (database, auth, redis, r2, …) get their own module in this
 * directory when the feature that needs them lands.
 */
export const sharedRuntime = {
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
} as const;

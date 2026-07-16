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
    /**
     * The public origin of the deployed platform (e.g. `https://resfolio.me`),
     * used for canonical URLs, sitemaps, and JSON-LD in the public render host.
     * Optional — absent, the render host falls back to the documented
     * production domain, so local/CI need not set it.
     */
    SITE_PUBLIC_URL: z.string().url().optional(),
  },
} as const;

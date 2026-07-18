import { z } from "zod";

/**
 * Blog authoring limits (docs/architecture/07-storage.md).
 *
 * `BLOG_MAX_IMAGES_PER_POST` is a **configurable ceiling, not a hardcoded
 * one** — the product requirement was explicit that this number must be
 * tunable. It is expressed here rather than as a constant so raising it (for a
 * paid tier, or because 5 turned out to be stingy) is a deployment setting
 * change instead of a code change and a release.
 *
 * Optional, with the domain's `DEFAULT_MAX_IMAGES_PER_POST` as the fallback:
 * an unset variable must mean "the sensible default", never a broken editor.
 * `coerce` because every environment variable arrives as a string.
 */
export const blog = {
  server: {
    BLOG_MAX_IMAGES_PER_POST: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional(),
  },
} as const;

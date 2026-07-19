import { createAppEnv, r2, render, sharedRuntime } from "@resfolio/env";
import { z } from "zod";

/**
 * apps/sites env — the rendering host (docs/architecture/09-rendering-pipeline.md).
 * Only the slices this app reads directly. `@resfolio/database` validates the
 * connection string on its own (dynamic) import; this app reads `DATABASE_URL`
 * only as an **optional presence flag** — the public portfolio route consults
 * the `sites` table only when a DB is configured, so the fixture/CI path (no
 * DB) resolves fixtures and 404s everything else instead of erroring.
 *
 * `R2_PUBLIC_BASE_URL` is read for one job only: resolving a blog post's cover
 * key to a URL when projecting posts into the Writing section. It stays
 * optional — absent simply renders those cards without a cover, which is the
 * same posture the rest of storage takes (doc 07).
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...render.server,
    DATABASE_URL: z.string().url().optional(),
    R2_PUBLIC_BASE_URL: r2.server.R2_PUBLIC_BASE_URL,
  },
  client: {},
  experimental__runtimeEnv: {},
});

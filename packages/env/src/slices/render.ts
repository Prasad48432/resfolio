import { z } from "zod";

/**
 * Rendering-host secrets (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md).
 *
 * `RENDER_SECRET` is a **server-to-server** secret — never handed to a user,
 * never placed in a user-facing URL. It bears the two dashboard→sites API
 * calls: `POST /api/revalidate` (publish invalidation) and
 * `POST /api/export/resume/[documentId]` (PDF).
 *
 * It was `PRINT_TOKEN_SECRET` until resume print tokens were removed: a resume
 * now has a permanent URL gated by its own `visibility` (doc 02), so there is
 * no print token left to name it after. Redis nonce hardening (doc 07) layers
 * on later — the secret is the stable dependency.
 *
 * `DASHBOARD_URL` went with the portfolio draft-preview route (2026-07-18):
 * it existed solely to widen that route's `frame-ancestors` allowlist, and
 * nothing frames `apps/sites` any more.
 */
export const render = {
  server: {
    RENDER_SECRET: z.string().min(16),
    /**
     * Set to `"1"` automatically by Vercel on every deployment; absent in local
     * dev. `apps/sites` reads it to pick the **serverless-compatible** Chromium
     * (`@sparticuz/chromium` + `playwright-core`) for PDF export instead of the
     * full local Playwright browser — so the same route works on Vercel and on
     * a developer's machine with no manual flag. Read here rather than as a raw
     * `process.env.VERCEL` check so the choice stays inside `@resfolio/env`
     * (doc 11). Never set this by hand.
     */
    VERCEL: z.string().optional(),
    /**
     * The dedicated PDF microservice (`services/pdf`, deployed to Fly.io): a
     * Node + Playwright container that renders a URL → PDF. When both are set,
     * `apps/sites` offloads PDF export to it (the `remote` engine) instead of
     * launching Chromium in-process — which is what makes export work on hosts
     * that can't run Chromium in-function (Vercel Hobby's 1 GB limit). Absent,
     * it falls back to `serverless` (Vercel) or `local` (dev). The secret is a
     * server-to-server bearer the service checks; it never reaches a browser.
     */
    PDF_SERVICE_URL: z.string().url().optional(),
    PDF_SERVICE_SECRET: z.string().min(16).optional(),
  },
  /**
   * The dashboard calls `apps/sites` for the resume PDF export. Optional
   * locally — both vars absent simply hides that affordance. Kept separate
   * from `server` so the dashboard boots without the secret while
   * `apps/sites` still requires it.
   */
  dashboard: {
    RENDER_SECRET: z.string().min(16).optional(),
    SITES_URL: z.string().url().optional(),
    /**
     * Kill switch for resume PDF export. Set to `"false"` to turn the feature
     * **off**: the Download-PDF button hides and the export route hard-refuses
     * (503), so no request ever reaches `apps/sites` or the PDF microservice —
     * a cost/safety lever you can flip without touching code. Unset or any other
     * value keeps it enabled (the default), so existing deployments are
     * unaffected. Takes effect on the next deploy (Vercel reads env at deploy).
     */
    PDF_EXPORT_ENABLED: z.enum(["true", "false"]).optional(),
  },
} as const;

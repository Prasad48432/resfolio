import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Importing env validates it at config-load time — a missing RENDER_SECRET
// fails the build, not a request (doc 11). Imported for the side effect only;
// no value is read here since the preview route's CSP carve-out was removed.
import "./lib/env";

const nextConfig: NextConfig = {
  // Pino uses worker-thread transports; keep it out of the server bundle
  // (same reason as apps/dashboard). `@sparticuz/chromium` ships a
  // brotli-compressed Chromium pack that webpack must not touch, and
  // `playwright-core` resolves its own runtime files — both must stay external
  // so the serverless PDF engine can locate its binary at runtime (lib/pdf.ts).
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "@sparticuz/chromium",
    "playwright-core",
  ],
  async headers() {
    return [
      {
        // The resume routes here are publicly readable (doc 02) but must never
        // be indexed: they are shared by link, and carry contact details with no
        // `discoverable` toggle to opt in with. This header is the authoritative
        // crawler signal; `robots.ts` disallows the same paths.
        //
        // Both resume surfaces are covered: `/render/*` (the id route + the
        // private draft/export routes) and `/r/*` (the pretty `/r/<username>`
        // alias). `/p/*` portfolios are deliberately absent — they earn indexing
        // through their own `discoverable` toggle.
        source: "/(render|r)/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

/**
 * **The dev server and the production build must not share an output tree.**
 *
 * `next dev` writes its route table incrementally: each route compiles on
 * demand and registers itself in `server/app-paths-manifest.json`. That manifest
 * — not the filesystem — is what maps an incoming URL to a compiled page, and a
 * URL missing from it is answered with `_not-found` **without the dev server
 * ever attempting to compile the route**. So a damaged manifest doesn't surface
 * as a build error or a stack trace. It surfaces as a silent, permanent 404 on
 * a page whose code is fine and whose data is fine.
 *
 * Both `next dev` and `next build` rooted their output at `.next/` (dev under
 * `.next/dev`, the build at the top level). `turbo run build` treats `.next/**`
 * as a cached output set, so building — or restoring a build from Turbo's cache
 * — rewrites and prunes inside the very tree a running dev server is
 * incrementally appending to. The dev manifest loses entries while the compiled
 * `page.js` files it points at survive, which is exactly the state this app was
 * found in: `/p/[username]/[[...slug]]/page.js` present on disk, absent from the
 * manifest, every page route 404ing while `robots.txt` and `sitemap.xml` (whose
 * entries happened to survive) kept answering 200.
 *
 * That is why the failure looked time-dependent and unfixable-by-restart: it
 * tracked whether a build had run against the tree, not anything in the request.
 *
 * Giving dev its own `distDir` removes the shared mutable state rather than
 * papering over its symptoms. `next build` and `next start` keep `.next/`, so
 * deployment and Turbo's output globs are unchanged.
 */
export default function config(phase: string): NextConfig {
  return phase === PHASE_DEVELOPMENT_SERVER
    ? { ...nextConfig, distDir: ".next-dev" }
    : nextConfig;
}

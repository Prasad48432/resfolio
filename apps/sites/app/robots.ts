import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/portfolio-seo";

/**
 * Platform robots (docs/architecture/04-deployment.md, 09-rendering-pipeline.md).
 * Public portfolios (`/p/*`) are crawlable — a non-discoverable *site* opts out
 * via its own per-page `noindex` (generateMetadata), not here.
 *
 * `/render/*` and `/r/*` stay disallowed even though the resume routes there
 * are now publicly readable (doc 02). Readable-by-link and crawlable are
 * different things: a resume carries an email and a phone number, and it has no
 * `discoverable` toggle to opt in with, so it is shared by link and kept out
 * of search. `X-Robots-Tag` on the same paths is the authoritative signal.
 * The on-demand revalidation + export APIs are disallowed too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/render/", "/r/", "/api/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

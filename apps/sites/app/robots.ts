import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/portfolio-seo";

/**
 * Platform robots (docs/architecture/04-deployment.md, 09-rendering-pipeline.md).
 * Public portfolios (`/p/*`) are crawlable — a non-discoverable *site* opts out
 * via its own per-page `noindex` (generateMetadata), not here. The private
 * render surface (`/p/*` aside) is `/render/*`: never indexed (also carries
 * `X-Robots-Tag` + is token-guarded), and the on-demand revalidation API is
 * disallowed too. The sitemap enumerates every discoverable published site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/render/", "/api/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

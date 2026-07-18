import type { PortfolioPageKind } from "@resfolio/template-sdk";
import type { MetadataRoute } from "next";

import { getPortfolioTemplate } from "@/lib/portfolio-templates";
import { siteUrl } from "@/lib/portfolio-seo";
import { FIXTURE_SITE_USERNAMES } from "@/lib/resolve-site";

/**
 * The platform sitemap (docs/architecture/04-deployment.md): every discoverable
 * published site, expanded to the pages its template actually serves. Detail
 * pages (project/blog posts) need a data-driven slug and are omitted — the
 * index pages link to them. Dynamic so it always reflects the current set of
 * published sites (it can't be static — the site list changes on publish).
 *
 * Two sources mirror the render path: the dev/CI **fixture** sites (which
 * always resolve) and the DB **discoverable** sites (dynamically imported so
 * the fixture path needs no database). A non-discoverable site never appears.
 */
export const dynamic = "force-dynamic";

// Pages that stand on their own (no required route param) and belong in a
// sitemap. Detail pages are reached from these, never listed directly.
const LISTABLE_PAGES: readonly PortfolioPageKind[] = [
  "home",
  "projects",
  "about",
  "resume",
  "blog",
];

const PAGE_PATH: Partial<Record<PortfolioPageKind, string>> = {
  home: "",
  projects: "projects",
  about: "about",
  resume: "resume",
  blog: "blog",
};

interface SitemapSite {
  username: string;
  templateId: string;
  lastModified?: Date;
}

function entriesFor(site: SitemapSite): MetadataRoute.Sitemap {
  const template = getPortfolioTemplate(site.templateId);
  if (!template) {
    return [];
  }
  return LISTABLE_PAGES.filter(
    (page) => template.capabilities.pages.includes(page),
  ).map((page) => ({
    url: siteUrl(site.username, PAGE_PATH[page] ?? ""),
    lastModified: site.lastModified,
    changeFrequency: "weekly" as const,
    priority: page === "home" ? 0.8 : 0.5,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sites: SitemapSite[] = FIXTURE_SITE_USERNAMES.map((username) => ({
    username,
    templateId: "dark-anime",
  }));

  // DB sites (best-effort — no database in the fixture/CI path).
  try {
    const { listDiscoverableSites } = await import(
      "@resfolio/portfolio/server"
    );
    const dbSites = await listDiscoverableSites();
    for (const site of dbSites) {
      // A DB slug shadows a same-named fixture (the DB is the real site).
      const existing = sites.findIndex((s) => s.username === site.slug);
      const entry: SitemapSite = {
        username: site.slug,
        templateId: site.templateId,
        lastModified: site.updatedAt,
      };
      if (existing >= 0) {
        sites[existing] = entry;
      } else {
        sites.push(entry);
      }
    }
  } catch {
    // No DB configured — the fixture sites still produce a valid sitemap.
  }

  return sites.flatMap(entriesFor);
}

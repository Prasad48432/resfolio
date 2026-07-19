import { resolvePortfolioRoute } from "@resfolio/portfolio";
import { richTextToPlainText } from "@resfolio/template-sdk";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPersonJsonLd, SITE_ORIGIN, siteUrl } from "@/lib/portfolio-seo";
import { renderPortfolioPage } from "@/lib/render-portfolio-page";
import { loadPortfolio, loadPost } from "@/lib/resolve-site";

/**
 * The public portfolio route (docs/architecture/03-portfolio-rendering.md,
 * 04-deployment.md): one catch-all resolves `resfolio.me/p/<username>/…` →
 * Site → published ProfileView → the requested template page. Server
 * Components, cached indefinitely and invalidated per site on publish (ISR +
 * `site:<id>` tags). Routes are platform-owned so URLs stay stable across
 * template switches; the template only declares which pages it supports.
 */

// ISR fallback TTL — nothing changes without a publish, which invalidates the
// `site:<id>` tag directly; this only guards against a missed invalidation.
export const revalidate = 86400;

interface PortfolioPageProps {
  params: Promise<{ username: string; slug?: string[] }>;
}

export async function generateMetadata({
  params,
}: PortfolioPageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const loaded = await loadPortfolio(username);
  if (!loaded) {
    return {};
  }

  const { basics } = loaded.view;
  const canonical = siteUrl(username, (slug ?? []).join("/"));
  const robots = loaded.discoverable
    ? undefined
    : // Respect the site's discoverable toggle (doc 04). Non-discoverable
      // sites still serve — they just ask crawlers not to index.
      { index: false, follow: false };

  // A post is its own document: it gets the post's title, description and
  // cover, not the owner's. Inheriting the profile's would give every post on
  // a site an identical title and social card — which is how a blog ends up
  // with one search result for twenty pieces of writing.
  const route = resolvePortfolioRoute(slug);
  if (route?.page === "blogPost" && loaded.profileId) {
    const post = await loadPost(loaded.profileId, route.params["slug"] ?? "");
    if (post) {
      return {
        metadataBase: new URL(SITE_ORIGIN),
        title: post.seo.title,
        description: post.seo.description || undefined,
        alternates: { canonical },
        robots,
        openGraph: {
          type: "article",
          title: post.seo.title,
          description: post.seo.description || undefined,
          url: canonical,
          publishedTime: post.publishedOn,
          tags: post.tags,
          images: post.coverImage ? [{ url: post.coverImage }] : undefined,
        },
      };
    }
  }

  const title = basics.name || "Portfolio";
  const description =
    richTextToPlainText(basics.summary).slice(0, 160) || undefined;

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: basics.avatarUrl ? [{ url: basics.avatarUrl }] : undefined,
    },
  };
}

export default async function PortfolioPage({ params }: PortfolioPageProps) {
  const { username, slug } = await params;

  const loaded = await loadPortfolio(username);
  if (!loaded) {
    notFound();
  }

  // One canonical schema.org Person per site, on the home page only (doc 04).
  const route = resolvePortfolioRoute(slug);
  const jsonLd =
    route?.page === "home"
      ? buildPersonJsonLd(loaded.view, siteUrl(username))
      : null;

  // Only the post route pays for a post load — see `loadPost`.
  const post =
    route?.page === "blogPost" && loaded.profileId
      ? await loadPost(loaded.profileId, route.params["slug"] ?? "")
      : undefined;

  const page = renderPortfolioPage({
    view: loaded.view,
    templateId: loaded.templateId,
    config: loaded.config,
    slug,
    basePath: `/p/${username.toLowerCase()}`,
    post,
  });

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // JSON.stringify output is safe to inline; no user HTML reaches here.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      {page}
    </>
  );
}

import type { ProfileView } from "@resfolio/template-sdk";
import { richTextToPlainText } from "@resfolio/template-sdk";

import { env } from "./env";

/**
 * SEO helpers for public portfolios (docs/architecture/04-deployment.md). The
 * public origin is where canonical URLs, the sitemap, and JSON-LD `url` point;
 * it's the documented production domain, overridable via `SITE_PUBLIC_URL` for
 * preview deploys (read via `@resfolio/env` so the rest of the app stays
 * origin-agnostic).
 */
export const SITE_ORIGIN = (
  env.SITE_PUBLIC_URL ?? "https://resfolio.me"
).replace(/\/$/, "");

/** The absolute public URL for a site's page (canonical + og:url + sitemap). */
export function siteUrl(username: string, path = ""): string {
  const suffix = path ? `/${path.replace(/^\//, "")}` : "";
  return `${SITE_ORIGIN}/p/${username.toLowerCase()}${suffix}`;
}

/**
 * A schema.org `Person` for the portfolio owner (doc 04 SEO). Built from the
 * projected ProfileView so it's always consistent with what renders; `sameAs`
 * aggregates the profile's public links (the standard way search engines tie
 * an identity to its other profiles). Emitted as a JSON-LD script on the home
 * page only — one canonical Person per site.
 */
export function buildPersonJsonLd(
  view: ProfileView,
  canonicalUrl: string,
): Record<string, unknown> {
  const { basics } = view;
  const sameAs = [
    ...basics.links.map((link) => link.url),
    basics.contacts.website,
  ].filter((url): url is string => Boolean(url));

  const description =
    basics.headline || richTextToPlainText(basics.summary).slice(0, 300);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: basics.name,
    url: canonicalUrl,
  };
  if (basics.headline) {
    jsonLd.jobTitle = basics.headline;
  }
  if (description) {
    jsonLd.description = description;
  }
  if (basics.avatarUrl) {
    jsonLd.image = basics.avatarUrl;
  }
  if (basics.location) {
    jsonLd.address = {
      "@type": "PostalAddress",
      addressLocality: basics.location,
    };
  }
  if (basics.contacts.email) {
    jsonLd.email = `mailto:${basics.contacts.email}`;
  }
  if (sameAs.length > 0) {
    jsonLd.sameAs = sameAs;
  }
  return jsonLd;
}

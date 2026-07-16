import type { PortfolioPageKind } from "@resfolio/template-sdk";

/**
 * The platform route table (docs/architecture/04-deployment.md). Routes are a
 * *platform* concept — not a template one — so a user's URLs stay stable when
 * they switch templates. This maps the catch-all URL segments after
 * `/p/<username>` to a page kind + params; the caller then checks whether the
 * chosen template *supports* that page (`capabilities.pages`) and 404s or
 * redirects home if not.
 *
 * Pure and total: returns `null` for any path that isn't a known route, which
 * the host renders as a 404.
 */
export interface PortfolioRouteMatch {
  page: PortfolioPageKind;
  /** Route params handed to the page renderer (e.g. `{ slug }`). */
  params: Record<string, string>;
}

export function resolvePortfolioRoute(
  segments: readonly string[] | undefined,
): PortfolioRouteMatch | null {
  const parts = segments ?? [];

  if (parts.length === 0) {
    return { page: "home", params: {} };
  }

  const [first, second, ...rest] = parts;
  if (rest.length > 0) {
    return null;
  }

  switch (first) {
    case "projects":
      return second
        ? { page: "projectDetail", params: { slug: second } }
        : { page: "projects", params: {} };
    case "blog":
      return second
        ? { page: "blogPost", params: { slug: second } }
        : { page: "blog", params: {} };
    case "about":
      return second ? null : { page: "about", params: {} };
    case "resume":
      return second ? null : { page: "resume", params: {} };
    default:
      return null;
  }
}

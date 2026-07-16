import { resolvePortfolioRoute } from "@resfolio/portfolio";
import {
  PROFILE_VIEW_VERSION,
  resolveTheme,
  type ProfileView,
} from "@resfolio/template-sdk";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { getPortfolioTemplate } from "@/lib/portfolio-templates";

/**
 * The shared Render stage for a portfolio page (docs/architecture/09-rendering-pipeline.md):
 * match the route → validate the template contract → validate config →
 * resolve the theme → render the page. Used by the public route and the
 * draft-preview route alike, so both render pixel-identically (the whole point
 * of a single host). Resolve/Project differ per surface; Render is this.
 *
 * `notFound()` for any gap (unknown route, template missing the page, invalid
 * config) so both surfaces 404 identically.
 */
export function renderPortfolioPage(input: {
  view: ProfileView;
  templateId: string;
  config: unknown;
  slug: string[] | undefined;
  basePath: string;
}): ReactElement {
  const route = resolvePortfolioRoute(input.slug);
  if (!route) {
    notFound();
  }

  const template = getPortfolioTemplate(input.templateId);
  if (!template) {
    notFound();
  }

  if (template.compat.profileView !== PROFILE_VIEW_VERSION) {
    throw new Error(
      `Template "${template.id}" targets ProfileView v${template.compat.profileView}, host builds v${PROFILE_VIEW_VERSION}.`,
    );
  }

  const Page = template.pages[route.page];
  if (!Page || !template.capabilities.pages.includes(route.page)) {
    notFound();
  }

  const parsedConfig = template.configSchema.safeParse(input.config);
  if (!parsedConfig.success) {
    notFound();
  }
  const config = parsedConfig.data;

  // Portfolio templates are opinionated: colors/type are the template's own, so
  // there are no user token overrides — the chosen preset resolves as-is.
  const theme = resolveTheme(template, {});

  return (
    <Page
      view={input.view}
      config={config}
      theme={theme}
      params={route.params}
      basePath={input.basePath}
    />
  );
}

import { resolvePortfolioRoute } from "@resfolio/portfolio";
import {
  PROFILE_VIEW_VERSION,
  resolveTheme,
  type PostView,
  type ProfileView,
} from "@resfolio/template-sdk";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { createLogger } from "@resfolio/observability";

import { getPortfolioTemplate } from "@/lib/portfolio-templates";

const log = createLogger("sites:render-portfolio");

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
  /**
   * The resolved post for a `blogPost` route. Resolved by the caller (the
   * Resolve stage) rather than here, because Render is pure and synchronous —
   * loading it here would make this async and break the property that Render
   * is the same code on every surface.
   */
  post?: PostView;
}): ReactElement {
  const route = resolvePortfolioRoute(input.slug);
  if (!route) {
    log.debug({ slug: input.slug }, "render 404: no route matches this path");
    notFound();
  }

  const template = getPortfolioTemplate(input.templateId);
  if (!template) {
    // A `sites` row pins `template_id` as text and nothing enforces that the
    // template still exists — deleting one without repointing its rows leaves
    // live sites 404ing (see templates/dark-anime/CLAUDE.md, migration 0009).
    log.error(
      { templateId: input.templateId },
      "render 404: template is not registered — orphaned site row?",
    );
    notFound();
  }

  if (template.compat.profileView !== PROFILE_VIEW_VERSION) {
    throw new Error(
      `Template "${template.id}" targets ProfileView v${template.compat.profileView}, host builds v${PROFILE_VIEW_VERSION}.`,
    );
  }

  const Page = template.pages[route.page];
  if (!Page || !template.capabilities.pages.includes(route.page)) {
    log.debug(
      { templateId: template.id, page: route.page },
      "render 404: template does not support this page",
    );
    notFound();
  }

  const parsedConfig = template.configSchema.safeParse(input.config);
  if (!parsedConfig.success) {
    // The likeliest cause is a template's config schema changing without a
    // migration for rows already storing the old shape — silent by nature,
    // because a rejected config renders as a missing page, not an error.
    log.error(
      { templateId: template.id, issues: parsedConfig.error.issues },
      "render 404: stored config rejected by the template's schema",
    );
    notFound();
  }
  const config = parsedConfig.data;

  // Portfolio templates are opinionated: colors/type are the template's own, so
  // there are no user token overrides — the chosen preset resolves as-is.
  const theme = resolveTheme(template, {});

  // A `blogPost` route whose slug matched nothing is a 404, decided here so
  // every surface answers identically — the template's own "Post not found"
  // body exists for robustness, not as the product behaviour.
  if (route.page === "blogPost" && !input.post) {
    log.debug(
      { slug: route.params["slug"] },
      "render 404: no published post with this slug",
    );
    notFound();
  }

  return (
    <Page
      view={input.view}
      config={config}
      theme={theme}
      params={route.params}
      basePath={input.basePath}
      post={input.post}
    />
  );
}

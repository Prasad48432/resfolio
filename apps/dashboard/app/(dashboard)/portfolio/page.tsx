import { requireSession } from "@resfolio/auth";
import { getSiteForOwner } from "@resfolio/portfolio/server";
import { getOrCreateProfile } from "@resfolio/profile/server";

import { PortfolioClaim } from "@/components/portfolio/portfolio-claim";
import { PortfolioEditor } from "@/components/portfolio/portfolio-editor";
import { describeConfigSchema } from "@/lib/config-form";
import { env } from "@/lib/env";
import {
  getDashboardPortfolioTemplate,
  PORTFOLIO_TEMPLATES,
} from "@/lib/portfolio-templates";

/**
 * The portfolio section (docs/architecture/03-portfolio-rendering.md,
 * 08-dashboard-ux.md). A user has one Site (`Profile × template + config`).
 * Before they claim one, this is the slug-claim + template pick; after, it's
 * the settings + publish surface. Content lives at `/profile`; a site only
 * presents it and picks the public URL. Reads server-side via the portfolio
 * domain; mutations go through `actions.ts` (thin adapters).
 */
function publicBaseUrl(): string {
  // The public origin for the "your site is at …" link + copy affordance.
  return (env.SITES_URL ?? "https://resfolio.me").replace(/\/$/, "");
}

export default async function PortfolioPage() {
  const { user } = await requireSession();
  const draft = await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });
  const site = await getSiteForOwner(user.id);

  if (!site) {
    // Suggest a slug from the user's name (the claim form validates it live).
    const suggested = (user.name ?? user.email ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    return (
      <PortfolioClaim
        templates={PORTFOLIO_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
        }))}
        suggestedSlug={suggested}
      />
    );
  }

  const template = getDashboardPortfolioTemplate(site.templateId);
  // Start the settings form from a schema-valid config (stored config may
  // predate a config change; parse with defaults).
  const config = template
    ? (template.configSchema.parse(site.config) as Record<string, unknown>)
    : (site.config as Record<string, unknown>);
  const fields = template ? describeConfigSchema(template.configSchema) : [];

  return (
    <PortfolioEditor
      // Remount on a template switch: `router.refresh()` is a soft refresh that
      // keeps client state, so keying on the template resets `switching` and
      // reseeds the config form from the new template's defaults.
      key={site.templateId}
      slug={site.slug}
      templateId={site.templateId}
      templates={PORTFOLIO_TEMPLATES.map((t) => ({ id: t.id, name: t.name }))}
      templateName={template?.name ?? site.templateId}
      fields={fields}
      initialConfig={config}
      discoverable={site.discoverable}
      publicBaseUrl={publicBaseUrl()}
      previewEnabled={Boolean(env.RENDER_SECRET && env.SITES_URL)}
      profilePublished={draft.publishedVersionId !== null}
      sitePublished={site.publishedVersionId !== null}
      siteUpToDate={
        site.publishedVersionId !== null &&
        site.publishedVersionId === draft.publishedVersionId &&
        // A template switch or config edit leaves the live page stale even when
        // the pinned profile version is unchanged (doc 04).
        !site.hasUnpublishedChanges
      }
    />
  );
}

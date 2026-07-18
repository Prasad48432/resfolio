"use server";

import { siteSlugSchema } from "@resfolio/portfolio";
import {
  createSite,
  getSiteForOwner,
  isSlugAvailable,
  ProfileNotPublishedError,
  publishSite,
  SlugTakenError,
  updateSite,
} from "@resfolio/portfolio/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import { markReferencedAssets } from "@/lib/assets";
import { env } from "@/lib/env";
import { getDashboardPortfolioTemplate } from "@/lib/portfolio-templates";

/**
 * Portfolio Site mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/portfolio/server`. The slug is validated with the
 * domain's `siteSlugSchema` (DNS-safe + reserved-word blocklist); config is
 * validated with the chosen template's own schema before it is stored (doc 05).
 * Publishing pins the profile's published version, then invalidates the public
 * page cache in `apps/sites` (doc 04).
 */

/** Translate the domain's expected failures into user-facing action errors. */
function toActionError(error: unknown): never {
  if (error instanceof SlugTakenError) {
    throw new ActionError(`The name "${error.slug}" is already taken.`);
  }
  if (error instanceof ProfileNotPublishedError) {
    throw new ActionError("Publish your profile before publishing your site.");
  }
  throw error;
}

/**
 * Ask `apps/sites` to drop this site's ISR cache after a publish (doc 04). The
 * two apps are separate deployments, so an in-process `revalidateTag` can't
 * reach the render host — we POST its on-demand revalidation route, guarded by
 * the shared render secret. Optional: absent config, the site still updates via
 * the 24h fallback TTL, so this is best-effort and never fails the publish.
 */
async function revalidatePublishedSite(siteId: string): Promise<void> {
  const sitesUrl = env.SITES_URL;
  const secret = env.RENDER_SECRET;
  if (!sitesUrl || !secret) {
    return;
  }
  try {
    await fetch(`${sitesUrl.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ siteId }),
    });
  } catch {
    // Best-effort — the fallback TTL covers a missed invalidation.
  }
}

export const createPortfolioSiteAction = createAction({
  name: "portfolio.create",
  input: z.object({
    slug: siteSlugSchema,
    templateId: z.string().min(1),
  }),
  handler: async ({ slug, templateId }, ctx) => {
    const template = getDashboardPortfolioTemplate(templateId);
    if (!template) {
      throw new ActionError("That template isn't available.");
    }
    // Attach the site to the user's profile (seed it if it's their first visit).
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    try {
      const site = await createSite(ctx.userId, {
        slug,
        templateId: template.id,
        templateMajor: template.major,
        config: template.defaultConfig,
      });
      revalidatePath("/portfolio");
      return { id: site.id, slug: site.slug };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const updatePortfolioSiteAction = createAction({
  name: "portfolio.update",
  input: z.object({
    slug: siteSlugSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    discoverable: z.boolean().optional(),
    /** Switch templates (doc 04 — routes are platform-owned, so URLs survive). */
    templateId: z.string().min(1).optional(),
  }),
  handler: async ({ slug, config, discoverable, templateId }, ctx) => {
    const site = await getSiteForOwner(ctx.userId);
    if (!site) {
      throw new ActionError("You don't have a site yet.");
    }

    // A template switch pins the new major and resets config to that template's
    // defaults — configs are template-owned and don't carry across (doc 05).
    // URLs are unaffected because routes are platform-owned (doc 04).
    if (templateId !== undefined && templateId !== site.templateId) {
      const next = getDashboardPortfolioTemplate(templateId);
      if (!next) {
        throw new ActionError("That template isn't available.");
      }
      try {
        const updated = await updateSite(ctx.userId, {
          templateId: next.id,
          templateMajor: next.major,
          config: next.defaultConfig,
        });
        revalidatePath("/portfolio");
        return { updatedAt: updated.updatedAt.toISOString() };
      } catch (error) {
        toActionError(error);
      }
    }

    // Validate config against the template's own schema before storing (doc 05).
    let validatedConfig: Record<string, unknown> | undefined;
    if (config !== undefined) {
      const template = getDashboardPortfolioTemplate(site.templateId);
      if (!template) {
        throw new ActionError("This site's template is unavailable.");
      }
      const parsed = template.configSchema.safeParse(config);
      if (!parsed.success) {
        throw new ActionError("Those settings aren't valid.");
      }
      validatedConfig = parsed.data as Record<string, unknown>;
    }

    try {
      const updated = await updateSite(ctx.userId, {
        slug,
        config: validatedConfig,
        discoverable,
      });
      // Any uploaded image this config points at is now live (doc 07).
      await markReferencedAssets(validatedConfig);
      revalidatePath("/portfolio");
      return { updatedAt: updated.updatedAt.toISOString() };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const publishPortfolioSiteAction = createAction({
  name: "portfolio.publish",
  input: z.object({}),
  handler: async (_input, ctx) => {
    try {
      const result = await publishSite(ctx.userId);
      await revalidatePublishedSite(result.siteId);
      revalidatePath("/portfolio");
      return { publishedVersionId: result.publishedVersionId };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const checkSlugAvailabilityAction = createAction({
  name: "portfolio.checkSlug",
  input: z.object({ slug: z.string() }),
  handler: async ({ slug }, ctx) => {
    // The slug must first be a *valid* slug; report format problems distinctly
    // from "taken" so the claim UI can guide the user.
    const parsed = siteSlugSchema.safeParse(slug);
    if (!parsed.success) {
      return {
        valid: false as const,
        available: false,
        reason: parsed.error.issues[0]?.message ?? "invalid",
      };
    }
    const available = await isSlugAvailable(ctx.userId, parsed.data);
    return { valid: true as const, available, reason: null };
  },
});

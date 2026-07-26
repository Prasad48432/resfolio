"use server";

import { handleSchema, HandleTakenError } from "@resfolio/profile";
import { claimHandle, getOrCreateProfile } from "@resfolio/profile/server";
import {
  createSite,
  getSiteForOwner,
  ProfileNotPublishedError,
  publishSite,
  updateSite,
} from "@resfolio/portfolio/server";
import { parseAssetKey } from "@resfolio/storage";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import { markReferencedAssets, markReferencedKeys } from "@/lib/assets";
import { getDashboardPortfolioTemplate } from "@/lib/portfolio-templates";
import { revalidatePublicSite } from "@/lib/revalidate-site";

/**
 * Portfolio Site mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/portfolio/server`. The public username is the
 * profile's **handle** (validated with `@resfolio/profile`'s `handleSchema` and
 * shared with the resume output), claimed via `claimHandle` before a site is
 * created — so the slug is no longer a Site field. Config is validated with the
 * chosen template's own schema before it is stored (doc 05). Publishing pins the
 * profile's published version, then invalidates the public page cache in
 * `apps/sites` (doc 04).
 */

/** Translate the domain's expected failures into user-facing action errors. */
function toActionError(error: unknown): never {
  if (error instanceof HandleTakenError) {
    throw new ActionError(`The name "${error.handle}" is already taken.`);
  }
  if (error instanceof ProfileNotPublishedError) {
    throw new ActionError("Publish your profile before publishing your site.");
  }
  throw error;
}

// Cache invalidation for the public site lives in `lib/revalidate-site.ts`,
// shared with the blog actions — a post write invalidates the same host.

export const createPortfolioSiteAction = createAction({
  name: "portfolio.create",
  input: z.object({
    slug: handleSchema,
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
      // The username is a profile handle, claimed first — shared by the resume
      // output, so a user who already claimed one from /resumes just re-affirms
      // it here (it's available to its owner).
      await claimHandle(ctx.userId, slug);
      const site = await createSite(ctx.userId, {
        templateId: template.id,
        templateMajor: template.major,
        config: template.defaultConfig,
      });
      revalidatePath("/portfolio");
      return { id: site.id, slug };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const updatePortfolioSiteAction = createAction({
  name: "portfolio.update",
  input: z.object({
    config: z.record(z.string(), z.unknown()).optional(),
    discoverable: z.boolean().optional(),
    /** Switch templates (doc 04 — routes are platform-owned, so URLs survive). */
    templateId: z.string().min(1).optional(),
    /** The favicon's R2 asset key (from `/api/uploads`), or `null` to clear it.
     * A general, template-independent site setting. */
    faviconKey: z.string().min(1).nullable().optional(),
  }),
  handler: async ({ config, discoverable, templateId, faviconKey }, ctx) => {
    const site = await getSiteForOwner(ctx.userId);
    if (!site) {
      throw new ActionError("You don't have a site yet.");
    }

    // Setting a favicon: the key must be a real `favicon` asset owned by this
    // user's profile. Ownership is encoded in the key (`u/<profileId>/…`), so
    // parsing it and comparing to the caller's profile makes pointing at
    // someone else's object structurally impossible (doc 07). `null` clears it.
    if (faviconKey) {
      const parsed = parseAssetKey(faviconKey);
      if (
        !parsed ||
        parsed.kind !== "favicon" ||
        parsed.ownerId !== site.profileId
      ) {
        throw new ActionError("That favicon isn't valid.");
      }
    }

    // A template switch pins the new major and resets config to that template's
    // defaults — configs are template-owned and don't carry across (doc 05).
    // URLs are unaffected because the username is the profile handle (doc 04).
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
        config: validatedConfig,
        discoverable,
        faviconKey,
      });
      // Any uploaded image this config points at is now live (doc 07). The
      // favicon lives in its own column, so `collectAssetKeys` can't find it by
      // walking config — mark its key explicitly.
      await markReferencedAssets(validatedConfig);
      if (faviconKey) {
        await markReferencedKeys([faviconKey]);
      }
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
      await revalidatePublicSite({ siteId: result.siteId });
      revalidatePath("/portfolio");
      return { publishedVersionId: result.publishedVersionId };
    } catch (error) {
      toActionError(error);
    }
  },
});

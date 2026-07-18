"use server";

import { profileSchema } from "@resfolio/profile";
import {
  publishProfile,
  saveDraft,
  StaleDraftError,
} from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction } from "@/lib/actions";
import { markReferencedAssets } from "@/lib/assets";

/**
 * Profile mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/profile/server`. Resolve session → parse with the
 * domain schema → call the domain function → typed ActionResult. No business
 * logic lives here.
 */

const saveDraftInput = z.object({
  profile: profileSchema,
  /** The draft revision the edit started from (optimistic concurrency,
   * doc 01). */
  baseRev: z.number().int().nonnegative(),
});

/**
 * Autosave the draft. Returns the new revision, or a `conflict` result when
 * another tab/device wrote first — the client reloads to rebase rather than
 * clobbering (doc 01). Conflict is an expected outcome, modeled as data, not
 * an error, so it isn't noise-reported to Sentry.
 */
export const saveProfileDraftAction = createAction({
  name: "profile.saveDraft",
  input: saveDraftInput,
  handler: async ({ profile, baseRev }, ctx) => {
    try {
      const draft = await saveDraft(ctx.userId, profile, baseRev);
      // Mark any uploaded images this draft points at as live (doc 07). This
      // is the app layer's job rather than the domain's: the *profile* has no
      // business knowing what R2 is, and coordinating two domains around one
      // user action is exactly what an action is for. Best-effort — a failure
      // here must never fail the save, because the only cost of missing a mark
      // is that the next save catches it.
      await markReferencedAssets(profile);
      return { status: "saved" as const, draftRev: draft.draftRev };
    } catch (error) {
      if (error instanceof StaleDraftError) {
        return { status: "conflict" as const, serverRev: error.actualRev };
      }
      throw error;
    }
  },
});

export const publishProfileAction = createAction({
  name: "profile.publish",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const result = await publishProfile(ctx.userId);
    // The public site + exports read the published version; refresh the
    // editor's server data so the publish state is reflected on next read.
    revalidatePath("/profile");
    return result;
  },
});

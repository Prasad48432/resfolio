"use server";

import { handleSchema, HandleTakenError } from "@resfolio/profile";
import {
  claimHandle,
  getOrCreateProfile,
  isHandleAvailable,
} from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";

/**
 * Shared **handle** (public username) mutations
 * (docs/architecture/04-deployment.md). The handle is a profile-level identity
 * shared by the portfolio (`/p/<handle>`) and resume (`/r/<handle>`) outputs, so
 * these actions live in their own module and are driven from **both** the
 * `/portfolio` and `/resumes` sections — whichever the user reaches first is the
 * entry point that claims it. Thin adapters over `@resfolio/profile/server`.
 */

export const checkHandleAvailabilityAction = createAction({
  name: "handle.check",
  input: z.object({ handle: z.string() }),
  handler: async ({ handle }, ctx) => {
    // Must first be a *valid* handle; report format problems distinctly from
    // "taken" so the claim UI can guide the user (mirrors the old slug check).
    const parsed = handleSchema.safeParse(handle);
    if (!parsed.success) {
      return {
        valid: false as const,
        available: false,
        reason: parsed.error.issues[0]?.message ?? "invalid",
      };
    }
    const available = await isHandleAvailable(ctx.userId, parsed.data);
    return { valid: true as const, available, reason: null };
  },
});

export const claimHandleAction = createAction({
  name: "handle.claim",
  input: z.object({ handle: handleSchema }),
  handler: async ({ handle }, ctx) => {
    // The profile row must exist before we can write its handle (a first-time
    // visitor may claim from /resumes before ever opening /profile).
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    try {
      const result = await claimHandle(ctx.userId, handle);
      // Both sections show the handle + its public URLs.
      revalidatePath("/portfolio");
      revalidatePath("/resumes");
      return { handle: result.handle };
    } catch (error) {
      if (error instanceof HandleTakenError) {
        throw new ActionError(`The name "${error.handle}" is already taken.`);
      }
      throw error;
    }
  },
});

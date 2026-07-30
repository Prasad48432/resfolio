"use server";

import { profileSchema } from "@resfolio/profile";
import {
  finishOnboarding,
  isOnboardingComplete,
} from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction } from "@/lib/actions";

/**
 * Onboarding mutations (docs/architecture/16-onboarding.md): thin `createAction`
 * adapters over `@resfolio/profile/server`, like every other route's actions.
 *
 * **Both exits from onboarding are here, and both are Server Actions.** The
 * extraction is a route handler because it carries a file (see
 * `app/api/onboarding/resume/route.ts`); the *write* is an action, because doc 13's
 * rule is that only a Server Action a human triggered ever writes a draft. That
 * rule is not relaxed for a brand-new profile.
 */

/**
 * Skip. Marks onboarding done and leaves the seeded draft alone, so the profile
 * editor opens on the ordinary example structure a first-access profile has always
 * had (doc 08: empty states teach).
 *
 * The identity is read from the session rather than accepted as input — it is the
 * same seed `getOrCreateProfile` would have produced on the user's first visit to
 * `/profile`, which is exactly where they are going next.
 */
export const skipOnboardingAction = createAction({
  name: "onboarding.skip",
  input: z.object({}),
  handler: async (_input, ctx) => {
    await finishOnboarding(ctx.userId, {
      identity: {
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      },
    });
    revalidatePath("/profile");
    return { ok: true as const };
  },
});

/**
 * Apply a reviewed resume import: replace the draft and finish onboarding.
 *
 * **The Profile arrives from the client, and that is not a hole.** It is the exact
 * posture the profile editor's autosave already has (`saveProfileDraftAction`
 * takes a whole `profileSchema` object): the value is re-parsed by the domain
 * schema on the way in, and the only thing a user could achieve by editing it in
 * flight is writing their own profile — which is what the next screen is for. What
 * this buys is that the counts the review screen showed were computed from the
 * *same object* being stored, so the summary cannot promise what applying does not
 * deliver.
 *
 * It refuses once onboarding is complete, which closes the one genuinely
 * surprising path: a stale tab left open on the review screen, applied an hour
 * later, would otherwise overwrite a profile the user had since filled in by hand.
 */
export const applyResumeImportAction = createAction({
  name: "onboarding.applyResumeImport",
  input: z.object({ profile: profileSchema }),
  handler: async ({ profile }, ctx) => {
    if (await isOnboardingComplete(ctx.userId)) {
      // Not an error: the user is already where this was taking them, and a
      // failure toast on a stale tab explains nothing useful.
      return { ok: true as const, applied: false };
    }

    await finishOnboarding(ctx.userId, { data: profile });

    // No `markReferencedAssets` here, unlike `saveProfileDraftAction`: nothing an
    // import produces can be one of our uploads. The extraction has no avatar
    // field at all, and every URL in it came off the resume, so
    // `collectAssetKeys` would walk the whole draft to find nothing. The first
    // autosave in the editor covers anything the user adds afterwards.
    revalidatePath("/profile");
    return { ok: true as const, applied: true };
  },
});

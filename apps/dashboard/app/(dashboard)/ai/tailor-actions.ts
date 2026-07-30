"use server";

import type { AiFeature } from "@resfolio/billing";
import { getDocument, updateDocument } from "@resfolio/document/server";
import { createLogger } from "@resfolio/observability";
import {
  MAX_PROPOSED_CHANGES,
  ProfileDataError,
  applyTailoredChanges,
  applyTailoredEmphasis,
  clearTailoring,
  countTailoredFields,
  profileChangeSchema,
  reviewTailorPlan,
  tailorEmphasisSchema,
  tailorPlanSchema,
  type TailorReview,
} from "@resfolio/profile";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { generateObject } from "ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import {
  authorizeAiFeature,
  settleAiSpend,
  tokensFrom,
  type AiReservation,
} from "@/lib/ai/billing";
import { parseJobRequest } from "@/lib/ai/job-analysis";
import { MAX_TAILOR_OUTPUT_TOKENS } from "@/lib/ai/limits";
import { buildProfileContext } from "@/lib/ai/profile-context";
import {
  aiModelId,
  getChatModel,
  isAiConfigured,
  isAiEnabled,
  structuredProviderOptions,
} from "@/lib/ai/provider";
import { checkAiRateLimit, type AiMode } from "@/lib/ai/rate-limit";
import { tailoringSystemPrompt } from "@/lib/ai/system-prompt";

/**
 * Resume tailoring (docs/architecture/13-ai-layer.md, Phase 5).
 *
 * **Moved here from `app/(dashboard)/ai/job/actions.ts` in Phase 7**, when
 * `/ai/job` was retired and the job workflow moved into the conversation. Nothing
 * about the actions changed; they sit beside `job-actions.ts` now because the
 * page they are invoked from is `/ai`.
 *
 * One consequence of the move is worth stating, because it is invisible and it
 * bites: **`maxDuration` is route-segment configuration**, so a Server Action
 * inherits it from the page it is invoked from. Tailoring used to inherit
 * `/ai/job`'s `export const maxDuration = 60`; it now inherits `/ai`'s, which is
 * why that page has one. Without it the platform default kills a twenty-second
 * tailoring pass and it reads as a model failure.
 *
 * **These are Server Actions, and the model call is one of them — there is no
 * third route handler.** That looks like an exception to Phase 4's pattern and is
 * actually the rule applied honestly: a route exists here *only* where a stream
 * is the product requirement, and tailoring cannot usefully stream.
 *
 * The reason is worth writing down, because "stream everything slow" is the
 * obvious instinct. A streamed result is only worth showing if the client can
 * render it as it arrives, and every row of a tailoring result must be **guarded
 * before it is shown** — the growth rules compare a proposed value against what
 * the profile actually stores, so the guard needs the profile's content. Phase 4
 * could stream because verifying a match needed only an item index (ids and
 * labels), which is safe to ship to a browser. Verifying a rewrite needs the
 * writing itself, and the serialized profile is the model's context; it has no
 * business in a client bundle. So the review is built on the server, the client
 * has nothing to draw until it exists, and the route handler would be streaming
 * to nobody.
 *
 * What that costs is one genuinely blocking twenty-second wait, shown as a real
 * pending state. What it buys is that no suggestion ever appears on screen and
 * then refuses to apply.
 *
 * Three actions: one reads and calls the model, two write. Only the two writes
 * touch the document, and both re-run the guard.
 */

const log = createLogger("dashboard:ai-tailor");

/**
 * The guard ladder, in action form.
 *
 * Same order and same reasoning as the routes' — cheapest refusal first, so a
 * flood costs a cookie lookup rather than a model request — with `ActionError`
 * where they use a status code. Session resolution already happened above this
 * (`createAction` does it before the handler runs), which is the first rung.
 */
async function requireAiBudget(
  userId: string,
  mode: AiMode,
  feature: AiFeature,
): Promise<AiReservation> {
  if (!isAiEnabled()) {
    throw new ActionError("Resfolio AI is currently switched off.");
  }
  if (!isAiConfigured()) {
    throw new ActionError("Resfolio AI isn't configured in this environment.");
  }
  const verdict = await checkAiRateLimit(userId, mode);
  if (!verdict.ok) {
    throw new ActionError(
      "You've tailored a lot of resumes recently. Try again in a few minutes.",
    );
  }
  // Quota last — the only rung that costs a database round trip (doc 14 §6).
  // `mode` and `feature` are separate parameters because they are separate
  // budgets: the limiter answers "too fast", the quota answers "too much", and
  // several modes deliberately share a rate window while keeping their own
  // allowance.
  const gate = await authorizeAiFeature(userId, feature);
  if (!gate.ok) {
    throw new ActionError(gate.message);
  }
  return gate.reservation;
}

export interface TailorResult {
  review: TailorReview;
  /** The resume this plan is for, echoed back so the review can name it without
   * trusting the client's copy of it. */
  resumeName: string;
}

/**
 * Ask the model for a tailoring plan and return the guarded review.
 *
 * **A Server Action that writes nothing**, which is unusual in this codebase and
 * correct here: it is a command, not a read. A Server Component cannot do it —
 * the input arrives from a textarea mid-page, and every invocation costs money —
 * and it is not a mutation, so nothing about it belongs in a route.
 */
export const tailorResumeAction = createAction({
  name: "ai.tailorResume",
  input: z.object({
    documentId: z.string().min(1),
    // Length is checked by `parseJobRequest` below rather than here, so an
    // oversized posting gets its own sentence instead of "Invalid input."
    jobDescription: z.string(),
  }),
  handler: async (
    { documentId, jobDescription },
    ctx,
  ): Promise<TailorResult> => {
    const reservation = await requireAiBudget(
      ctx.userId,
      "tailor",
      "resumeTailor",
    );

    const parsed = parseJobRequest({ jobDescription });
    if (!parsed.ok) {
      throw new ActionError(parsed.problem.message);
    }

    // User-scoped: a document id that isn't the caller's throws before a token
    // is spent.
    const document = await getDocument(ctx.userId, documentId);
    const draft = await getOrCreateProfile(ctx.userId);
    const context = buildProfileContext(draft.data);

    if (context.isStarter) {
      // Refunded — nothing reached a model. Same reasoning as the enhancement
      // action: reserving before the profile read is right, so the refund is what
      // pays for the ordering.
      await settleAiSpend(reservation, { outcome: "error" });
      throw new ActionError(
        "Your profile is still the starter template — there's nothing to tailor yet.",
      );
    }

    let plan;
    try {
      const result = await generateObject({
        model: getChatModel(),
        schema: tailorPlanSchema,
        system: tailoringSystemPrompt(context, document.name),
        // The posting is the only whole prompt in this product written by a third
        // party, so it goes in delimited as the user message — never spliced into
        // the system prompt. The delimiter is hygiene; the guarantee is that a
        // successful injection can still only produce changes the domain guard
        // accepts, against this user's own profile.
        prompt: `<job-description>\n${parsed.jobDescription}\n</job-description>`,
        maxOutputTokens: MAX_TAILOR_OUTPUT_TOKENS,
        // Missing here until now, while every other structured call had it — so
        // the one call with **no stream and no partial output** was also the one
        // running at the model's full default reasoning budget. That is the worst
        // possible pairing: a user watching a spinner for the entire generation,
        // waiting on deliberation nobody will ever see. See `provider.ts`.
        providerOptions: structuredProviderOptions(),
      });
      plan = result.object;

      log.info(
        {
          userId: ctx.userId,
          mode: "tailor",
          model: aiModelId(),
          documentId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          profileChars: context.json.length,
          jdChars: parsed.jobDescription.length,
          changes: plan.changes.length,
        },
        "ai resume tailoring",
      );

      await settleAiSpend(reservation, {
        outcome: "ok",
        ...tokensFrom(result.usage),
      });
    } catch (error) {
      // Everything from here is a provider failure: an unfunded key, a timeout,
      // or output that didn't satisfy the schema. None of them are the user's
      // fault and none are actionable by them, so they get one sentence — but
      // they are logged in full, because an unfunded key is indistinguishable
      // from a bug from the outside.
      log.error(
        { err: error, userId: ctx.userId, model: aiModelId(), documentId },
        "ai tailoring failed",
      );
      // `generateObject` has no partial output: a schema failure or a timeout is
      // a call billed in full for nothing the user can use.
      await settleAiSpend(reservation, { outcome: "error" });
      throw new ActionError(
        "That tailoring pass didn't go through. Try again — nothing was changed.",
      );
    }

    return {
      review: reviewTailorPlan(draft.data, document.view, plan),
      resumeName: document.name,
    };
  },
});

/**
 * Apply what the user accepted to the resume's view definition.
 *
 * **The only write in this workflow, and it does not trust its input.** The
 * changes arrive from a browser, so they are re-parsed with the domain schema and
 * re-run through the domain guard against the profile as it stands *now* — model
 * output that has been round-tripped through a client is not less hostile than
 * model output, and a plan produced a minute ago may no longer fit a profile
 * edited in another tab.
 *
 * Note which profile the guard reads: the **draft**, because that is what the
 * user is looking at. A public resume renders the *published* version, where a
 * delta for an item that doesn't exist yet is simply inert — `buildProfileView`
 * looks deltas up per item, so an unmatched one is ignored rather than an error.
 *
 * Accept-one and apply-all are the same call with a different array, exactly as
 * in Phase 3: the batching is in the transport, the consent is per change.
 */
export const applyTailoringAction = createAction({
  name: "ai.applyTailoring",
  input: z.object({
    documentId: z.string().min(1),
    changes: z.array(profileChangeSchema).max(MAX_PROPOSED_CHANGES).default([]),
    emphasis: tailorEmphasisSchema.nullable().default(null),
  }),
  handler: async ({ documentId, changes, emphasis }, ctx) => {
    if (changes.length === 0 && emphasis === null) {
      throw new ActionError("Nothing to apply.");
    }

    const document = await getDocument(ctx.userId, documentId);
    const draft = await getOrCreateProfile(ctx.userId);

    let view = document.view;

    if (changes.length > 0) {
      try {
        view = applyTailoredChanges(draft.data, view, changes);
      } catch (error) {
        if (error instanceof ProfileDataError) {
          throw new ActionError(
            "Those rewrites no longer match your profile — it changed after they were suggested. Tailor again for fresh ones.",
          );
        }
        throw error;
      }
    }

    if (emphasis !== null) {
      view = applyTailoredEmphasis(view, emphasis);
    }

    await updateDocument(ctx.userId, documentId, { view });

    // The editor reads its document server-side, so without these it would show
    // the untailored version until something else forced a refetch. `/resumes`
    // too, because the tailored-field count is listed there.
    revalidatePath("/resumes");
    revalidatePath(`/resumes/${documentId}`);

    return {
      applied: changes.length,
      reordered: emphasis !== null,
      tailoredFields: countTailoredFields(view),
    };
  },
});

/**
 * Drop every override on a resume, back to the profile's own wording.
 *
 * Not a convenience. Tailoring is cumulative by construction — a pass for a new
 * posting leaves the previous pass' deltas on every field it does not touch — so
 * without this a resume tailored twice is tailored for neither job, and the only
 * escape is deleting the document. It keeps `sectionOrder`, `include` and
 * `exclude`, which are the user's own Sections-panel decisions rather than
 * tailored content.
 */
export const clearTailoringAction = createAction({
  name: "ai.clearTailoring",
  input: z.object({ documentId: z.string().min(1) }),
  handler: async ({ documentId }, ctx) => {
    const document = await getDocument(ctx.userId, documentId);
    const cleared = clearTailoring(document.view);

    await updateDocument(ctx.userId, documentId, { view: cleared });
    revalidatePath("/resumes");
    revalidatePath(`/resumes/${documentId}`);

    return { cleared: countTailoredFields(document.view) };
  },
});

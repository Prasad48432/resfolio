"use server";

import { getDocument, updateDocument } from "@resfolio/document/server";
import {
  coverLetterSchema,
  saveJobMatchInputSchema,
  storedAnalysisSchema,
} from "@resfolio/job";
import {
  deleteJobMatch,
  getJobMatch,
  listJobMatchesForChat,
  recordJobEnhancement,
  saveCoverLetter,
  saveJobMatch,
  setJobStatus,
} from "@resfolio/job/server";
import { createLogger } from "@resfolio/observability";
import {
  MAX_PROPOSED_CHANGES,
  addDemonstratedSkills,
  applyProfileChanges,
  findDemonstratedSkills,
  itemIdSchema,
  profileChangeSchema,
  profileProposalSchema,
  reviewProfileChanges,
  type ProfileChangeReview,
} from "@resfolio/profile";
import {
  StaleDraftError,
  getOrCreateProfile,
  saveDraft,
} from "@resfolio/profile/server";
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
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { jobEnhancementSystemPrompt } from "@/lib/ai/system-prompt";

/**
 * Job match sessions and profile enhancement
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **Every function here is a Server Action, including the one that calls a
 * model.** That is doc 13's rule applied rather than abandoned: a route handler
 * exists only where a stream is the product requirement. The match itself streams
 * — it is a tool call inside the chat — and persisting it is a write of a
 * finished thing. The enhancement pass calls a model but cannot usefully stream,
 * for the same reason `tailorResumeAction` cannot: **the guard needs the
 * profile's content**, so the review has to be built on the server, so there is
 * nothing for a client to render as it arrives.
 *
 * The write path is unchanged from Phase 3 and that is the point. An enhancement
 * is a `ProfileChangeReview` a human accepts change by change, through the same
 * domain guard that refuses to invent a skill. "Enhance my profile for this job"
 * is a *reason* to propose changes, never a permission to make them.
 */

const log = createLogger("dashboard:ai-job");

/**
 * The guard ladder, in action form — the routes' ladder with `ActionError` where
 * they use a status code. Session resolution already happened (`createAction`
 * does it before the handler runs), which is the first rung.
 */
async function requireEnhanceBudget(userId: string): Promise<AiReservation> {
  if (!isAiEnabled()) {
    throw new ActionError("Resfolio AI is currently switched off.");
  }
  if (!isAiConfigured()) {
    throw new ActionError("Resfolio AI isn't configured in this environment.");
  }
  // Counted under `tailor`: it is the same shape of cost — the whole profile
  // plus a posting, asking for structured rewrites — and a user who has spent
  // their tailoring budget has spent this one.
  const verdict = await checkAiRateLimit(userId, "tailor");
  if (!verdict.ok) {
    throw new ActionError(
      "You've done a lot of this recently. Try again in a few minutes.",
    );
  }
  // Quota is the last rung, for the same reason it is in the routes: it is the
  // only one that costs a database round trip (doc 14 §6).
  //
  // **The rate limiter and the quota are counted separately and both apply.** They
  // answer different questions — "too fast" and "too much" — and the limiter is
  // per-mode while the quota is per-feature. `profileEnhance` here, not
  // `resumeTailor`: they share a *rate* budget because they cost the same, and
  // they have separate *allowances* because they are separate product promises.
  const gate = await authorizeAiFeature(userId, "profileEnhance");
  if (!gate.ok) {
    // `ActionError` is the expected-failure channel — it is not reported to
    // Sentry, which is right: a spent allowance is the system working.
    throw new ActionError(gate.message);
  }
  return gate.reservation;
}

/**
 * Persist a match the chat produced.
 *
 * Called once per settled turn by the card, exactly as the transcript is saved —
 * and for the same reason the tool's `execute` does not do it: **the tool is
 * pure and has no database access**. An AI tool with a write path is the shape
 * this architecture exists to not have, and "it only writes a job row" is how
 * that erodes.
 *
 * The id was minted server-side inside the tool result, so this is an upsert and
 * a conversation reopened next week updates the job it created rather than
 * making a second one.
 */
export const saveJobMatchAction = createAction({
  name: "job.save",
  input: saveJobMatchInputSchema,
  handler: async (input, ctx) => {
    const saved = await saveJobMatch(ctx.userId, input);
    // Null means the id belongs to another profile. Not distinguishable from
    // success by the client, deliberately — see the repository.
    return { job: saved };
  },
});

/**
 * The jobs that came out of this conversation.
 *
 * **A Server Action used as a read, which is unusual here and deliberate.** Doc
 * 06's rule is that reads happen in Server Components, and the page does load
 * this list that way — but the panel also has to refresh the *instant* a match
 * saves itself mid-conversation, and the alternative to an action is
 * `router.refresh()`, which re-renders the route and remounts the transcript the
 * user is reading. The chat has been down that road once already (see
 * `AiWorkspace`). So: server-rendered on arrival, and topped up by this.
 */
export const listJobMatchesForChatAction = createAction({
  name: "job.listForChat",
  input: z.object({ chatSessionId: z.uuid() }),
  handler: async ({ chatSessionId }, ctx) => {
    const jobs = await listJobMatchesForChat(ctx.userId, chatSessionId);
    return { jobs };
  },
});

/** One job with everything on it — what the panel opens. */
export const getJobMatchAction = createAction({
  name: "job.get",
  input: z.object({ jobId: z.uuid() }),
  handler: async ({ jobId }, ctx) => {
    const job = await getJobMatch(ctx.userId, jobId);
    return { job };
  },
});

/**
 * Ask the model to enhance the profile for one posting, and return the guarded
 * review.
 *
 * **A Server Action that writes nothing.** It is a command, not a read: the input
 * arrives from a card mid-conversation and every invocation costs money.
 *
 * Note what it does *not* take: a score, or any indication of whether the user
 * saw a confirmation dialog. The `<70%` warning is a product courtesy rendered by
 * the card; it is not a permission this action checks, because it is not a
 * permission — the guard below is the same one whatever the score was, and
 * nothing here is more or less allowed for a poorly-matched job.
 */
export const enhanceProfileForJobAction = createAction({
  name: "job.enhanceProfile",
  input: z.object({
    jobId: z.uuid(),
    // Length is checked by `parseJobRequest` below rather than here, so an
    // oversized posting gets its own sentence instead of "Invalid input."
    jobDescription: z.string(),
  }),
  handler: async (
    { jobId, jobDescription },
    ctx,
  ): Promise<{ review: ProfileChangeReview; jobId: string }> => {
    const reservation = await requireEnhanceBudget(ctx.userId);

    const parsed = parseJobRequest({ jobDescription });
    if (!parsed.ok) {
      throw new ActionError(parsed.problem.message);
    }

    const draft = await getOrCreateProfile(ctx.userId);
    const context = buildProfileContext(draft.data);

    if (context.isStarter) {
      // The credit is returned: nothing reached a model, and charging for a
      // refusal we could have made before reserving would be charging for the
      // order of the checks. (Reserving first is still right — the starter check
      // needs a profile read, which is more expensive than the counter write.)
      await settleAiSpend(reservation, { outcome: "error" });
      throw new ActionError(
        "Your profile is still the starter template — there's nothing to enhance yet.",
      );
    }

    let proposal;
    try {
      const result = await generateObject({
        model: getChatModel(),
        schema: profileProposalSchema,
        system: jobEnhancementSystemPrompt(context),
        // The posting is the only whole prompt in this product written by a
        // third party, so it goes in delimited as the user message — never
        // spliced into the system prompt. The delimiter is hygiene; the
        // guarantee is that a successful injection can still only produce
        // changes the domain guard accepts, against this user's own profile.
        prompt: `<job-description>\n${parsed.jobDescription}\n</job-description>`,
        maxOutputTokens: MAX_TAILOR_OUTPUT_TOKENS,
        // Structured output with a user waiting on a blank panel — see
        // `provider.ts` for the measurement behind this.
        providerOptions: structuredProviderOptions(),
      });
      proposal = result.object;

      log.info(
        {
          userId: ctx.userId,
          mode: "enhance",
          model: aiModelId(),
          jobId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens,
          finishReason: result.finishReason,
          profileChars: context.json.length,
          jdChars: parsed.jobDescription.length,
          changes: proposal.changes.length,
        },
        "ai profile enhancement",
      );

      await settleAiSpend(reservation, {
        outcome: "ok",
        ...tokensFrom(result.usage),
      });
    } catch (error) {
      // A provider failure, a timeout, or output that did not satisfy the
      // schema. None is the user's fault and none is actionable by them, so
      // they get one sentence — but it is logged in full, because an unfunded
      // key is indistinguishable from a bug from the outside.
      log.error(
        { err: error, userId: ctx.userId, model: aiModelId(), jobId },
        "ai enhancement failed",
      );
      // Refunded, and this is the case it matters for: `generateObject` has no
      // partial output, so a schema failure or a timeout is a call billed in full
      // for nothing the user can use.
      await settleAiSpend(reservation, { outcome: "error" });
      throw new ActionError(
        "That didn't go through. Try again — nothing was changed.",
      );
    }

    // The same guard the chat's proposal tool runs, against the same draft. A
    // rewrite that would add a skill this posting asks for is refused here, which
    // is exactly the case this feature is most tempted by.
    return {
      review: reviewProfileChanges(draft.data, proposal.changes),
      jobId,
    };
  },
});

/**
 * Apply the enhancements the user accepted, and record them on the job.
 *
 * **`applyProfileChangesAction` with a job attached, not a second write path.**
 * It re-parses the changes with the domain schema and re-runs the guard against
 * the draft as it stands now, for the reason that action spells out: model output
 * round-tripped through a client is not less hostile than model output.
 *
 * What it adds is the record. The job row learns what this posting caused, which
 * is the question "what did I change for this one" — the only question a tracker
 * can be asked about an application that is already sent.
 */
export const applyJobEnhancementAction = createAction({
  name: "job.applyEnhancement",
  input: z.object({
    jobId: z.uuid(),
    changes: z.array(profileChangeSchema).min(1).max(MAX_PROPOSED_CHANGES),
  }),
  handler: async ({ jobId, changes }, ctx) => {
    const draft = await getOrCreateProfile(ctx.userId);
    const review = reviewProfileChanges(draft.data, changes);

    if (review.valid.length === 0) {
      throw new ActionError(
        "Those suggestions no longer match your profile — it changed after they were made. Ask again for fresh ones.",
      );
    }

    const accepted = review.valid.map((entry) => entry.change);
    const next = applyProfileChanges(draft.data, accepted);

    try {
      await saveDraft(ctx.userId, next, draft.draftRev);
    } catch (error) {
      if (error instanceof StaleDraftError) {
        throw new ActionError(
          "Your profile was saved somewhere else while this was applying. Try again.",
        );
      }
      throw error;
    }

    // The score is deliberately **not** written here. It is a fresh judgement
    // against the profile as it now reads, which costs a model call — so it is
    // recorded when the user asks the chat to re-check, not guessed at the moment
    // the write lands. A number invented here would be the one thing on the card
    // nobody could check.
    await recordJobEnhancement(ctx.userId, jobId, {
      appliedChanges: accepted,
    });

    revalidatePath("/profile");

    return {
      applied: review.valid.length,
      skipped: review.rejected.length,
    };
  },
});

/**
 * The posting's terms that this profile **demonstrates but does not list**
 * (docs/architecture/13-ai-layer.md).
 *
 * **This is the answer to "the analysis says I have Docker and my resume's Skills
 * block doesn't".** A profile routinely proves a technology in a project's
 * `technologies` or an experience bullet while the Skills section — the block a
 * resume prints and an ATS scans — never mentions it. Every other path in this
 * feature was structurally unable to fix that: the proposal guard forbids a set
 * gaining a member, and it must, because the proposer is a model.
 *
 * Here the proposer is the **user**, ticking a box beside their own sentence, and
 * `@resfolio/profile`'s `findDemonstratedSkills` is what makes that safe — a term
 * with no appearance elsewhere in the profile is never offered, and
 * `addDemonstratedSkills` re-checks rather than trusting this list. OWASP stays a
 * gap; Docker stops being a lie of omission.
 *
 * Reads the job's **stored** keywords rather than taking them from the client:
 * the analysis is already on the row, and a term arriving from a browser is a
 * term somebody could have chosen.
 */
export const listDemonstratedSkillsAction = createAction({
  name: "job.listDemonstratedSkills",
  input: z.object({ jobId: z.uuid() }),
  handler: async ({ jobId }, ctx) => {
    const [job, draft] = await Promise.all([
      getJobMatch(ctx.userId, jobId),
      getOrCreateProfile(ctx.userId),
    ]);

    if (!job) {
      throw new ActionError("That job isn't there any more.");
    }

    // Only the terms the posting actually leans on, in its own order.
    const terms = (job.analysis?.keywords ?? []).map((entry) => entry.keyword);

    return {
      skills: findDemonstratedSkills(draft.data, terms),
      groups: draft.data.sections.skills.map((group) => ({
        id: group.id,
        name: group.name,
      })),
    };
  },
});

/**
 * List demonstrated skills — on the profile, or on one resume.
 *
 * **The destination is the same choice `OptimiseForJob` asks**, and it is honoured
 * the same way: the profile branch writes the draft, the resume branch writes a
 * `deltas` entry on that document's `ViewDefinition` and leaves the profile
 * exactly as it was. Both go through `addDemonstratedSkills`, so neither can list
 * a term the profile does not already contain — the destination decides where the
 * result is stored, never what may be stored.
 *
 * The resume branch computes the group's new `skills` array with the domain
 * function and then writes **that array** as a delta, rather than inventing a
 * second growth path: the delta is a value, and the value came from the guard.
 */
export const listSkillsForJobAction = createAction({
  name: "job.listSkills",
  input: z.object({
    jobId: z.uuid(),
    destination: z.enum(["profile", "resume"]),
    documentId: z.uuid().optional(),
    additions: z
      .array(
        z.object({
          groupId: itemIdSchema,
          skill: z.string().trim().min(1).max(80),
        }),
      )
      .min(1)
      .max(20),
  }),
  handler: async ({ jobId, destination, documentId, additions }, ctx) => {
    const draft = await getOrCreateProfile(ctx.userId);

    // Throws `ProfileDataError` for a term with no demonstration, which is the
    // guarantee — this is not a re-statement of the client's check, it is the
    // check.
    let next;
    try {
      next = addDemonstratedSkills(draft.data, additions);
    } catch (error) {
      throw new ActionError(
        error instanceof Error
          ? error.message
          : "Those skills couldn't be listed.",
      );
    }

    if (destination === "profile") {
      try {
        await saveDraft(ctx.userId, next, draft.draftRev);
      } catch (error) {
        if (error instanceof StaleDraftError) {
          throw new ActionError(
            "Your profile was saved somewhere else while this was applying. Try again.",
          );
        }
        throw error;
      }
      revalidatePath("/profile");
      await recordJobEnhancement(ctx.userId, jobId, {
        appliedChanges: additions,
      });
      return { listed: additions.length, destination };
    }

    if (!documentId) {
      throw new ActionError("Pick a resume first.");
    }

    const document = await getDocument(ctx.userId, documentId);
    if (!document) {
      throw new ActionError("That resume isn't there any more.");
    }

    // One delta per touched group, carrying the guarded array. Merged into any
    // deltas already there, because tailoring may have written some — replacing
    // the map would silently drop a pass the user accepted.
    const touched = new Set(additions.map((entry) => entry.groupId));
    const deltas = { ...(document.view.deltas ?? {}) };
    for (const group of next.sections.skills) {
      if (touched.has(group.id)) {
        deltas[group.id] = { ...deltas[group.id], skills: group.skills };
      }
    }

    await updateDocument(ctx.userId, documentId, {
      view: { ...document.view, deltas },
    });

    revalidatePath(`/resumes/${documentId}`);
    return { listed: additions.length, destination };
  },
});

/**
 * Record a re-match against the same posting.
 *
 * Separate from {@link saveJobMatchAction} because it writes `enhancedScore`
 * rather than `initialScore` — the baseline is written once, on insert, and a
 * second run must not move the number the "74% → 86%" claim is measured against.
 */
export const recordRematchAction = createAction({
  name: "job.recordRematch",
  input: z.object({
    jobId: z.uuid(),
    score: z.number().int().min(0).max(100),
    analysis: storedAnalysisSchema,
  }),
  handler: async ({ jobId, score, analysis }, ctx) => {
    const job = await getJobMatch(ctx.userId, jobId);
    if (!job) {
      throw new ActionError("That job is no longer saved.");
    }

    const saved = await saveJobMatch(ctx.userId, {
      id: jobId,
      jobDescription: job.jobDescription,
      enhancedScore: score,
      analysis,
    });

    return { job: saved };
  },
});

/** Attach a resume to a job. A reference, never a copy — see the domain. */
export const setJobResumeAction = createAction({
  name: "job.setResume",
  input: z.object({ jobId: z.uuid(), documentId: z.uuid() }),
  handler: async ({ jobId, documentId }, ctx) => {
    const job = await getJobMatch(ctx.userId, jobId);
    if (!job) {
      throw new ActionError("That job is no longer saved.");
    }

    // User-scoped: a document id that isn't the caller's throws before it is
    // stored. Ownership of the job is not ownership of everything named on it.
    await getDocument(ctx.userId, documentId);

    const saved = await saveJobMatch(ctx.userId, {
      id: jobId,
      jobDescription: job.jobDescription,
      resumeDocumentId: documentId,
    });

    return { job: saved };
  },
});

/**
 * Store a generated letter against its job.
 *
 * The letter is streamed by `/api/ai/cover-letter` — prose, where streaming is
 * genuinely the product — and saved here once it is finished. Same division as
 * the transcript: the stream is a route, the write is an action.
 */
export const saveCoverLetterAction = createAction({
  name: "job.saveCoverLetter",
  input: z.object({ jobId: z.uuid(), letter: coverLetterSchema }),
  handler: async ({ jobId, letter }, ctx) => {
    const saved = await saveCoverLetter(ctx.userId, jobId, letter);
    if (!saved) {
      throw new ActionError("That job is no longer saved.");
    }
    return { saved };
  },
});

/**
 * Move a job through the tracker.
 *
 * **The Application Tracker's write, shipped before the tracker.** Nothing calls
 * it with anything but `saved` today. It exists because the claim that this
 * architecture does not prevent a tracker is worth more as four working lines
 * than as a sentence in a document.
 */
export const setJobStatusAction = createAction({
  name: "job.setStatus",
  input: z.object({
    jobId: z.uuid(),
    status: z.enum(["saved", "applied", "interviewing", "rejected", "offer"]),
  }),
  handler: async ({ jobId, status }, ctx) => {
    const updated = await setJobStatus(ctx.userId, jobId, status);
    if (!updated) {
      throw new ActionError("That job is no longer saved.");
    }
    revalidatePath("/ai");
    return { status };
  },
});

/** Forget a job. No confirmation: like a chat, nothing else links to it and the
 * posting is a paste away. */
export const deleteJobMatchAction = createAction({
  name: "job.delete",
  input: z.object({ jobId: z.uuid() }),
  handler: async ({ jobId }, ctx) => {
    const deleted = await deleteJobMatch(ctx.userId, jobId);
    revalidatePath("/ai");
    return { deleted };
  },
});

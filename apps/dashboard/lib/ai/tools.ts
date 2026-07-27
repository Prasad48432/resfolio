import {
  MAX_PROPOSED_CHANGES,
  describeProfileItems,
  profileProposalSchema,
  reviewProfileChanges,
  type Profile,
  type ProfileChangeReview,
  type ProfileProposal,
} from "@resfolio/profile";
import type { InferUITools, Tool, UIMessage } from "ai";
import { tool } from "ai";

import {
  MAX_REQUIREMENTS,
  buildJobMatchReview,
  indexProfileItems,
  jobMatchInputSchema,
  type JobMatchInput,
  type JobMatchReview,
} from "./job-analysis";

/**
 * The model's one tool (docs/architecture/13-ai-layer.md, Phase 3).
 *
 * **This is the propose stage of `propose → validate → review → apply`, and it
 * is the only stage the model participates in.** The tool writes nothing. Its
 * `execute` runs the domain's pure guard over the proposal and returns the
 * partition — which is what reaches the browser as a tool part, and what the
 * review UI renders. Applying is a Server Action the *user* triggers, against
 * the profile as it stands at that moment.
 *
 * Two things make the round trip worth its latency rather than just letting the
 * model emit a proposal into the stream:
 *
 * - **A rejected change never reaches a screen.** The guard runs here, on the
 *   server, before the diff is rendered. Showing the user a suggestion and then
 *   refusing to apply it is a worse experience than never offering it.
 * - **The model is told what was refused**, in one line, so its closing
 *   sentence matches what the user is actually looking at. A model that
 *   proposes five changes, has two rejected, and then says "I've suggested five
 *   improvements" is wrong on the screen it is wrong on.
 *
 * The tool set is built **per request, closed over the profile that request
 * loaded**. There is no profile id on the wire and no lookup inside `execute`,
 * so there is no parameter a prompt could talk the model into changing — the
 * same reason the profile is loaded server-side rather than fetched by a tool
 * (doc 13, Phase 2).
 */

/** What the guard's own reason codes mean when the model needs to know why. One
 * line each: this is context for a closing sentence, not an error report. */
const REJECTION_SUMMARIES = {
  "unknown-item": "no item with that id exists",
  "field-not-proposable": "that field can't be rewritten",
  "wrong-value-type": "wrong value type for that field",
  "invalid-value": "the value isn't valid profile content",
  "added-content": "it would have added information the profile doesn't have",
  unchanged: "it matched what's already there",
} as const;

function describeForModel(review: ProfileChangeReview): string {
  const lines = [
    `${review.valid.length} change${review.valid.length === 1 ? "" : "s"} passed validation and ${review.valid.length === 1 ? "is" : "are"} now shown to the user for approval.`,
  ];

  if (review.rejected.length > 0) {
    const reasons = [
      ...new Set(
        review.rejected.map((entry) => REJECTION_SUMMARIES[entry.reason]),
      ),
    ];
    lines.push(
      `${review.rejected.length} were rejected and are not shown: ${reasons.join("; ")}.`,
    );
  }

  lines.push(
    "Do not repeat the changes in prose — the user can see them. Reply with at most one short sentence. Do not say anything has been saved: nothing is applied until the user accepts it.",
  );

  return lines.join(" ");
}

/**
 * The tool set's type, written out rather than inferred.
 *
 * Not a style choice: under pnpm's strict layout TypeScript cannot name the
 * inferred type without pointing at a `.pnpm/…` path, so an inferred return
 * type fails `tsc` with TS2742. Naming it also gives the client something to
 * `import type` that does not drag the implementation along.
 *
 * A `type` and not an `interface`, for a reason that costs an hour to
 * rediscover: only type aliases get an implicit index signature, and without
 * one this is not assignable to the SDK's `ToolSet`.
 */
export type AiTools = {
  proposeProfileChanges: Tool<ProfileProposal, ProfileChangeReview>;
  analyzeJobMatch: Tool<JobMatchInput, JobMatchReview | JobMatchUnavailable>;
};

/** What the match tool returns when there is no posting in the conversation to
 * match against — see `findJobDescription`. A discriminated result rather than a
 * throw, because "you haven't pasted a posting yet" is a thing to say, not an
 * error to render as a crash. */
export interface JobMatchUnavailable {
  unavailable: true;
  reason: "no-posting";
}

export function isJobMatchUnavailable(
  output: JobMatchReview | JobMatchUnavailable,
): output is JobMatchUnavailable {
  return "unavailable" in output;
}

/**
 * The phases a chat turn actually passes through, server-side.
 *
 * **Every one of these is a real transition, written at the moment it happens** —
 * that is the whole point, and it is what separates this from the loading theatre
 * doc 13 rules out. `reading` is emitted when the profile read begins, `thinking`
 * when the model call is dispatched, `truncated` when the generation stopped
 * against its token ceiling. None of them is on a timer, none of them is inferred
 * from elapsed time, and none of them is a guess about what the model is doing
 * inside a step.
 *
 * Note what is absent: there is no phase for "writing the answer". While text is
 * arriving, **the text is the progress indicator** — a label next to streaming
 * prose would be a caption on something the user can already see.
 */
export const AI_PHASES = ["reading", "thinking", "truncated"] as const;

export type AiPhase = (typeof AI_PHASES)[number];

export interface AiProgress {
  phase: AiPhase;
  /** One short clause of real detail — how many profile entries were loaded, say.
   * Absent rather than invented when there is nothing true to add. */
  detail?: string;
}

/**
 * The typed message shape for this app's chat.
 *
 * Client components import this **as a type only**, so nothing in this module —
 * including the tool descriptions — is bundled for the browser. It is what lets
 * `AiMessage` narrow a `tool-proposeProfileChanges` part to a real
 * `ProfileChangeReview` instead of casting an `unknown`, and a `data-progress`
 * part to a real {@link AiProgress}.
 *
 * The data-part map is written out rather than left as the SDK's open
 * `UIDataTypes`, so the route and the client cannot disagree about the shape of a
 * progress crumb — a mismatch there fails as a silently missing label, which is
 * the class of bug this whole feature keeps having to design against.
 */
export type AiDataParts = { progress: AiProgress };

export type AiUIMessage = UIMessage<never, AiDataParts, InferUITools<AiTools>>;

/** One line for the model about a match it just produced, so its closing
 * sentence agrees with the card the user is looking at. The full review is a
 * screenful of structure; re-sending it on every later turn would re-bill the
 * analysis for the life of the conversation. */
function describeMatchForModel(
  output: JobMatchReview | JobMatchUnavailable,
): string {
  if (isJobMatchUnavailable(output)) {
    return "There is no job posting in this conversation yet. Ask the user to paste the job description (and the posting's URL if they have it). Do not analyse anything.";
  }

  const { summary } = output;
  const demoted = output.requirements.filter((item) => item.downgraded).length;

  const lines = [
    `The match is computed and shown to the user: ${summary.score}% — ${summary.strong} strong, ${summary.partial} partial, ${summary.gap} gaps out of ${summary.total}.`,
  ];

  if (demoted > 0) {
    lines.push(
      `${demoted} of your claimed matches cited profile items that do not exist and were recorded as gaps.`,
    );
  }

  lines.push(
    "Do not restate the requirements or the score — the user can see them. Reply with at most two short sentences: what stands out, and what the biggest gap is. Do not offer to add anything to their profile that is not already in it.",
  );

  return lines.join(" ");
}

/**
 * The context one chat turn's tools are closed over.
 *
 * **The posting is here rather than in the tool's input schema**, which is the
 * decision that makes an in-chat match affordable: the model spends twenty
 * tokens triggering the tool instead of re-emitting the whole job description as
 * arguments. Same principle as the profile — the request already has it, so the
 * model is not asked to carry it.
 */
export interface AiToolContext {
  /** The posting this conversation is about, or null when nobody has pasted
   * one. Found by `findJobDescription`, never invented. */
  jobDescription: string | null;
  /**
   * The serialized profile **exactly as the model was shown it**
   * (`buildProfileContext().json`), used as the keyword haystack.
   *
   * Not `JSON.stringify(profile)`, and the difference is a real bug: the context
   * builder strips the seeded starter placeholders, so matching against the raw
   * draft would report "your profile already mentions Example Company" — coverage
   * for text the model never saw and the user never wrote.
   */
  profileJson: string;
  /** Ids for matches produced this turn. Injected so the route decides them and
   * a test can make them deterministic. */
  newJobId: () => string;
}

export function createAiTools(
  profile: Profile,
  context: AiToolContext,
): AiTools {
  return {
    ...createProfileTools(profile),

    analyzeJobMatch: tool({
      description: [
        "Match the user's profile against a job posting they have pasted into this conversation, and show them an interactive result with a score.",
        "Call this as soon as a message contains a job description — a list of responsibilities and requirements for a role — even if the user only pasted it without asking a question.",
        "Also call it again when the user asks to re-check or recalculate the match after changing their profile.",
        "Do NOT paste the job description back into the arguments: it is already in the conversation and Resfolio reads it from there.",
        `Extract the role, the company and the location as the posting spells them, up to ${MAX_REQUIREMENTS} real requirements (ignore benefits and equal-opportunity boilerplate), and the terms the posting leans on.`,
        "For each requirement, give the profile item ids that support it BEFORE giving a level, then the level, then one line of justification. Never write a score or a percentage — Resfolio computes it.",
      ].join(" "),
      inputSchema: jobMatchInputSchema,
      // Pure, like the proposal tool's: it resolves citations against the
      // profile this request loaded, does the arithmetic, and returns. **No
      // database write happens here** — persisting the job is a Server Action
      // the client fires once the turn settles, exactly as the transcript is.
      // An AI tool with write access is the shape this architecture exists to
      // not have.
      execute: ({ ...input }) => {
        if (context.jobDescription === null) {
          return { unavailable: true, reason: "no-posting" } as const;
        }

        return buildJobMatchReview(input, {
          jobId: context.newJobId(),
          jobDescription: context.jobDescription,
          index: indexProfileItems(describeProfileItems(profile)),
          haystack: context.profileJson,
        });
      },
      toModelOutput: ({ output }) => ({
        type: "text",
        value: describeMatchForModel(output),
      }),
    }),
  };
}

/** The proposal half on its own. Split out rather than inlined above so the two
 * tools stay independently readable — and typed as a `Pick`, because a function
 * that returns half the tool set must not claim to return all of it. */
export function createProfileTools(
  profile: Profile,
): Pick<AiTools, "proposeProfileChanges"> {
  return {
    proposeProfileChanges: tool({
      description: [
        "Propose edits to the user's existing profile content for them to review and accept.",
        "Use this whenever the user asks you to improve, rewrite, tighten, or reword anything in their profile — instead of writing the new wording in your reply.",
        "You can only rewrite prose that already exists (summaries, descriptions, highlights) and prune or reorder skills and technologies.",
        "You cannot add entries, add skills, or change facts such as employers, titles, dates or links; there is no way to express that here and attempts are rejected.",
        `Each change targets one field of one item by its "id" from the profile JSON. At most ${MAX_PROPOSED_CHANGES} changes per call.`,
      ].join(" "),
      inputSchema: profileProposalSchema,
      // Pure and synchronous: the guard reads the profile this request already
      // loaded. No database, no network — an AI tool with write access is the
      // exact shape this architecture exists to not have.
      execute: ({ changes }) => reviewProfileChanges(profile, changes),
      // The UI gets the full partition (it has a diff to draw); the model gets
      // two sentences. Sending the whole result back would re-bill the diff the
      // model just produced, on every subsequent turn of the conversation.
      toModelOutput: ({ output }) => ({
        type: "text",
        value: describeForModel(output),
      }),
    }),
  };
}

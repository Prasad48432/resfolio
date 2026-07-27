import {
  MAX_PROPOSED_CHANGES,
  profileProposalSchema,
  reviewProfileChanges,
  type Profile,
  type ProfileChangeReview,
  type ProfileProposal,
} from "@resfolio/profile";
import type { InferUITools, Tool, UIMessage } from "ai";
import { tool } from "ai";

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
};

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

export function createProfileTools(profile: Profile): AiTools {
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

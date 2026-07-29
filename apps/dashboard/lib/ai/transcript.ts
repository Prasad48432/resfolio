import {
  reviewProfileChanges,
  type Profile,
  type ProfileChangeReview,
  type ReviewedChange,
} from "@resfolio/profile";

import type { AiUIMessage, ProposalOutput } from "./tools";

/**
 * Re-running the guard over a **saved** transcript
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **A stored proposal is a record of what was suggested, not of what was done**,
 * and until this existed the chat rendered it as though it were both. Reopening a
 * conversation replayed every `proposeProfileChanges` result exactly as it
 * arrived — Apply buttons and all — for changes the user had already accepted,
 * three weeks after the profile moved on. Pressing one either did nothing (the
 * value already matches) or, worse, overwrote wording edited by hand since.
 *
 * The verdict needed no new state, no "applied" column and no bookkeeping,
 * because "is this change still worth offering" is exactly the question
 * `reviewProfileChanges` answers, and the domain already has the right answer for
 * this case: **`unchanged`**. A change whose value is already in the profile is
 * not a suggestion any more, it is a description of the profile.
 *
 * **What it does with that answer is the part worth reading, because the obvious
 * thing is wrong.** The first version dropped an applied change from the review
 * entirely, which fixed the button and broke something better: the diff
 * disappeared. A conversation where you accepted six rewrites and came back to
 * find no trace of them is a conversation that has forgotten what it did for you
 * — and the record of "here is what your summary said before, and what it says
 * now" is the most useful thing on that screen after the fact. So an applied
 * change **stays, rendered, marked `Applied`**, with its stored before/after
 * intact; only the button goes.
 *
 * Three outcomes, then, and each is a different thing to show:
 *
 * - **Applied** → kept in `valid`, listed in `settledIndexes`, rendered with the
 *   green "Applied" marker instead of a button. The reported problem, fixed
 *   without throwing the history away.
 * - **Stale** → moved to `rejected`. A proposal against an item deleted since, or
 *   one whose replacement no longer parses, comes back `unknown-item` or
 *   `invalid-value`, and an offer that would fail on click is worse than no offer.
 *   It was already re-checked at apply time (`applyProfileChangesAction`); this
 *   moves the discovery from after the click to before it.
 * - **Outstanding** → untouched, button and all. The point is not to expire
 *   suggestions, it is to stop lying about which ones still are suggestions.
 *
 * Pure, so it is unit-testable without a database, and it runs on the server
 * (`ai/page.tsx`) with the profile that page already loaded — the client is never
 * asked to decide this, and never sees the profile it would need to.
 *
 * **Live turns do not go through here.** A proposal arriving right now was
 * reviewed against this same profile seconds ago inside the tool's `execute`;
 * re-reviewing it would be the same call twice. This is for `initialMessages`
 * only, which is also why `settledIndexes` is optional on the output type — a
 * fresh proposal has nothing settled and says so by omission.
 */
export function reconcileTranscript(
  messages: readonly AiUIMessage[],
  profile: Profile,
): AiUIMessage[] {
  return messages.map((message) => {
    if (
      !message.parts.some(
        (part) =>
          part.type === "tool-proposeProfileChanges" &&
          part.state === "output-available",
      )
    ) {
      // The overwhelming majority of messages. Returned by reference so the
      // transcript is not rebuilt wholesale to change one part in one turn.
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part) =>
        part.type === "tool-proposeProfileChanges" &&
        part.state === "output-available"
          ? { ...part, output: reconcileReview(part.output, profile) }
          : part,
      ),
    };
  });
}

/**
 * One stored review, re-judged against the profile as it now stands.
 *
 * **Judged one change at a time, deliberately.** `reviewProfileChanges` over the
 * whole array would be one call, but it partitions rather than annotates — and
 * the three outcomes here need to go three different places, two of which stay in
 * `valid`. Per-change costs nothing (the guard is pure and the array is capped at
 * `MAX_PROPOSED_CHANGES`) and keeps the original display order, which matters
 * because the model wrote these in the order it wants them read.
 *
 * **An applied change keeps its *stored* before/after**, not a recomputed one.
 * Recomputing would give "no change" — the profile now says the new value — when
 * what the user came back to see is what it used to say.
 *
 * **The original refusals are re-run too.** Carrying them across unexamined would
 * be simpler and would let a change refused for a reason that no longer holds
 * stay refused forever; re-running means the whole review is one pass over one
 * profile rather than one fresh half beside one remembered half. Their count
 * survives either way, which is the property that matters — "2 suggestions were
 * dropped" disappearing on reload is the same dishonesty this function exists to
 * remove, pointed the other way.
 */
export function reconcileReview(
  review: ProfileChangeReview,
  profile: Profile,
): ProposalOutput {
  const valid: ReviewedChange[] = [];
  const settledIndexes: number[] = [];
  const rejected: ProfileChangeReview["rejected"] = [];

  for (const entry of review.valid) {
    const verdict = reviewProfileChanges(profile, [entry.change]);

    if (verdict.valid.length > 0) {
      // Still outstanding, and re-derived rather than trusted: `before` may have
      // moved since, and a diff promising the wrong starting point is worse than
      // no diff.
      valid.push(...verdict.valid);
      continue;
    }

    if (verdict.rejected[0]?.reason === "unchanged") {
      settledIndexes.push(valid.length);
      valid.push(entry);
      continue;
    }

    rejected.push(...verdict.rejected);
  }

  for (const entry of review.rejected) {
    const verdict = reviewProfileChanges(profile, [entry.change]);
    // A refusal that no longer holds becomes an offer. It reads as a resurrection
    // and it is the only honest outcome: the guard refused "add Rust to your
    // skills" because the profile did not list Rust, and if the user has since
    // added it, the rewrite around it is an ordinary change. Dropping it silently
    // — the shape this had first — loses a change the guard now permits.
    valid.push(...verdict.valid);
    rejected.push(...verdict.rejected);
  }

  return { valid, rejected, settledIndexes };
}

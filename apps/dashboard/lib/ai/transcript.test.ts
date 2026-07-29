import {
  createEmptyProfile,
  createItemId,
  reviewProfileChanges,
  SECTION_ITEM_SCHEMAS,
  type Profile,
  type ProfileChange,
} from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import { reconcileReview, reconcileTranscript } from "./transcript";
import type { AiUIMessage } from "./tools";

/**
 * The bug these guard: **a saved transcript replayed its Apply buttons.**
 *
 * It is invisible to any test that exercises one page load, because the tool
 * output is correct when it arrives — it goes stale afterwards, silently, in the
 * database. So every case here is "the profile moved on; what does the stored
 * review say now".
 */

const ITEM_ID = createItemId();
const SKILLS_ID = createItemId();

/** Built through the section's own schema rather than by hand: the guard
 * re-parses every item it touches, so a fixture that only *looks* like an
 * experience entry produces `invalid-value` on every change and the test proves
 * nothing about reconciliation. */
function profileWithSummary(summary: string): Profile {
  const base = createEmptyProfile();
  return {
    ...base,
    sections: {
      ...base.sections,
      experience: [
        SECTION_ITEM_SCHEMAS.experience.parse({
          id: ITEM_ID,
          source: "manual",
          company: "Revival Labs",
          role: "Full Stack AI Developer",
          startDate: "2025-07",
          location: "Seoul (Remote)",
          summary,
        }),
      ],
      skills: [
        SECTION_ITEM_SCHEMAS.skills.parse({
          id: SKILLS_ID,
          source: "manual",
          name: "Languages",
          skills: ["TypeScript", "Python"],
        }),
      ],
    },
  } as Profile;
}

function change(value: string): ProfileChange {
  return {
    target: "item",
    section: "experience",
    itemId: ITEM_ID,
    field: "summary",
    value,
    reason: "Leads with the work this posting cares about.",
  };
}

/** A real fabrication: a skills set gaining a member the profile never listed.
 * It must stay counted as a refusal after reconciliation rather than quietly
 * becoming an "already applied" — the two read as opposite things to the user. */
const FABRICATION: ProfileChange = {
  target: "item",
  section: "skills",
  itemId: SKILLS_ID,
  field: "skills",
  value: ["TypeScript", "Python", "Rust"],
  reason: "The posting asks for Rust.",
};

function proposalMessage(review: unknown): AiUIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts: [
      {
        type: "tool-proposeProfileChanges",
        toolCallId: "call-1",
        state: "output-available",
        input: { changes: [] },
        output: review,
      },
    ],
  } as unknown as AiUIMessage;
}

describe("reconcileReview", () => {
  it("keeps a change the profile has not taken yet", () => {
    const profile = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(profile, [
      change("Shipped an AI matching engine."),
    ]);

    const reconciled = reconcileReview(stored, profile);

    expect(reconciled.valid).toHaveLength(1);
    expect(reconciled.rejected).toHaveLength(0);
  });

  it("keeps a change the user already accepted, marked rather than removed", () => {
    const applied = "Shipped an AI matching engine.";
    const before = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(before, [change(applied)]);
    expect(stored.valid).toHaveLength(1);

    // The user pressed Apply, and later reopened the conversation.
    const reconciled = reconcileReview(stored, profileWithSummary(applied));

    // Still on screen — the diff is the record of what was done, and dropping it
    // is how a conversation forgets what it did for you.
    expect(reconciled.valid).toHaveLength(1);
    expect(reconciled.settledIndexes).toEqual([0]);
    // Not a refusal. The UI splits on this, and calling an accepted edit a
    // rejection is close to the worst thing that screen could say.
    expect(reconciled.rejected).toHaveLength(0);
  });

  it("shows an applied change as it was, not as a no-op", () => {
    const applied = "Shipped an AI matching engine.";
    const stored = reviewProfileChanges(profileWithSummary("Built things."), [
      change(applied),
    ]);

    const reconciled = reconcileReview(stored, profileWithSummary(applied));

    // The stored before/after, so the card still reads "it used to say this".
    // Recomputing against the current profile would show no change at all.
    expect(reconciled.valid[0]?.before).toBe("Built things.");
    expect(reconciled.valid[0]?.after).toBe(applied);
  });

  it("retires a change whose item no longer exists", () => {
    const before = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(before, [change("Shipped an engine.")]);

    const reconciled = reconcileReview(stored, createEmptyProfile());

    expect(reconciled.valid).toHaveLength(0);
    expect(reconciled.rejected[0]?.reason).toBe("unknown-item");
  });

  it("carries the original refusals through rather than losing the count", () => {
    const profile = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(profile, [
      change("Shipped an AI matching engine."),
      FABRICATION,
    ]);
    expect(stored.valid).toHaveLength(1);
    expect(stored.rejected).toHaveLength(1);

    const reconciled = reconcileReview(stored, profile);

    // "2 suggestions were dropped" must not disappear on reload — the guard
    // refused them, the user was told, and that stays true.
    expect(reconciled.valid).toHaveLength(1);
    expect(reconciled.rejected).toHaveLength(1);
    expect(reconciled.rejected[0]?.reason).not.toBe("unchanged");
  });

  it("separates already-applied from refused in one pass", () => {
    const applied = "Shipped an AI matching engine.";
    const before = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(before, [change(applied), FABRICATION]);

    const reconciled = reconcileReview(stored, profileWithSummary(applied));

    // One kept and marked, one still refused. The two must never be counted
    // together — they read as opposite things.
    expect(reconciled.valid).toHaveLength(1);
    expect(reconciled.settledIndexes).toEqual([0]);
    expect(reconciled.rejected).toHaveLength(1);
    expect(reconciled.rejected[0]?.reason).toBe("added-content");
  });

  it("leaves settledIndexes empty when nothing has been applied", () => {
    const profile = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(profile, [
      change("Shipped an engine."),
    ]);

    expect(reconcileReview(stored, profile).settledIndexes).toEqual([]);
  });

  it("re-offers a refusal that no longer holds", () => {
    const profile = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(profile, [FABRICATION]);
    expect(stored.valid).toHaveLength(0);

    // The user went and added Rust to their profile themselves. The change the
    // guard refused is now an ordinary reorder, so it comes back as an offer
    // rather than being dropped on the floor.
    const withRust = profileWithSummary("Built things.");
    const group = withRust.sections.skills[0];
    const reconciled = reconcileReview(stored, {
      ...withRust,
      sections: {
        ...withRust.sections,
        skills: [{ ...group, skills: ["TypeScript", "Python", "Rust", "Go"] }],
      },
    } as Profile);

    expect(reconciled.valid).toHaveLength(1);
    expect(reconciled.rejected).toHaveLength(0);
  });
});

describe("reconcileTranscript", () => {
  it("returns messages with no proposal by reference", () => {
    const plain: AiUIMessage = {
      id: "m0",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    } as unknown as AiUIMessage;

    const [out] = reconcileTranscript([plain], createEmptyProfile());

    expect(out).toBe(plain);
  });

  it("marks a stored proposal's applied changes without removing them", () => {
    const applied = "Shipped an AI matching engine.";
    const stored = reviewProfileChanges(profileWithSummary("Built things."), [
      change(applied),
    ]);

    const [out] = reconcileTranscript(
      [proposalMessage(stored)],
      profileWithSummary(applied),
    );

    const part = out?.parts[0] as {
      output: { valid: unknown[]; settledIndexes: number[] };
    };
    expect(part.output.valid).toHaveLength(1);
    expect(part.output.settledIndexes).toEqual([0]);
  });

  it("leaves a proposal that is still outstanding alone", () => {
    const profile = profileWithSummary("Built things.");
    const stored = reviewProfileChanges(profile, [
      change("Shipped an engine."),
    ]);

    const [out] = reconcileTranscript([proposalMessage(stored)], profile);

    const part = out?.parts[0] as {
      output: { valid: unknown[]; settledIndexes: number[] };
    };
    expect(part.output.valid).toHaveLength(1);
    expect(part.output.settledIndexes).toEqual([]);
  });
});

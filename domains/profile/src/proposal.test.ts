import { describe, expect, it } from "vitest";

import { addItem, updateBasics } from "./edit";
import { ProfileDataError } from "./errors";
import {
  applyProfileChanges,
  profileChangeSchema,
  profileProposalSchema,
  reviewProfileChanges,
  type ProfileChange,
} from "./proposal";
import { createEmptyProfile } from "./seed";
import type { Profile } from "./schema/profile";

/**
 * Every case here is one a model actually produces, and every one of them is a
 * case where accepting the output would put something false — or something
 * unrenderable — on a real person's resume. The guard is the reason the AI
 * layer is allowed to exist at all (doc 13), so its tests are the ones that
 * must not be thin.
 */

function baseProfile(): Profile {
  let profile = updateBasics(createEmptyProfile(), {
    summary: "Engineer.",
  });
  profile = addItem(profile, "experience", {
    id: "exp-1",
    source: "manual",
    company: "Acme",
    role: "Senior Engineer",
    location: "",
    summary: "Built things.",
    highlights: ["Shipped the billing rewrite.", "Mentored two engineers."],
  });
  profile = addItem(profile, "projects", {
    id: "proj-1",
    source: "manual",
    name: "Orbit",
    description: "A scheduler.",
    technologies: ["TypeScript", "Postgres"],
    highlights: [],
  });
  profile = addItem(profile, "skills", {
    id: "skill-1",
    source: "manual",
    name: "Languages",
    skills: ["TypeScript", "Go"],
  });
  return profile;
}

const rewriteExperienceSummary: ProfileChange = {
  target: "item",
  section: "experience",
  itemId: "exp-1",
  field: "summary",
  value: "Owned billing end to end.",
  reason: "Leads with ownership.",
};

describe("profileChangeSchema", () => {
  it("has no shape in which an item can be added", () => {
    // The invariant stated as a test: every valid change names an *existing*
    // item, so "add a role at Globex" is not something the type can express.
    const add = {
      target: "add",
      section: "experience",
      value: { company: "Globex", role: "Staff Engineer" },
      reason: "The JD wants staff-level scope.",
    };
    expect(profileChangeSchema.safeParse(add).success).toBe(false);
  });

  it("rejects a field that is a fact rather than prose", () => {
    const renameEmployer = {
      target: "item",
      section: "experience",
      itemId: "exp-1",
      field: "company",
      value: "Globex",
      reason: "Better known brand.",
    };
    expect(profileChangeSchema.safeParse(renameEmployer).success).toBe(false);
  });

  it("rejects a section that carries only facts", () => {
    const bumpFluency = {
      target: "item",
      section: "languages",
      itemId: "lang-1",
      field: "summary",
      value: "Fluent",
      reason: "Stronger.",
    };
    expect(profileChangeSchema.safeParse(bumpFluency).success).toBe(false);
  });

  it("requires a reason on every change", () => {
    // A change with no stated reason is one the review UI cannot justify to the
    // person deciding, which makes it a change nobody should be asked to accept.
    const withoutReason: Record<string, unknown> = {
      ...rewriteExperienceSummary,
    };
    delete withoutReason["reason"];
    expect(profileChangeSchema.safeParse(withoutReason).success).toBe(false);
  });

  it("caps how many changes one proposal may carry", () => {
    const changes = Array.from({ length: 13 }, () => rewriteExperienceSummary);
    expect(profileProposalSchema.safeParse({ changes }).success).toBe(false);
  });
});

describe("reviewProfileChanges", () => {
  it("accepts a rewrite and reports what it would replace", () => {
    const review = reviewProfileChanges(baseProfile(), [
      rewriteExperienceSummary,
    ]);
    expect(review.rejected).toEqual([]);
    expect(review.valid).toHaveLength(1);
    expect(review.valid[0]?.before).toBe("Built things.");
    expect(review.valid[0]?.after).toBe("Owned billing end to end.");
    // The label is what the review UI shows instead of an id.
    expect(review.valid[0]?.label).toBe("Senior Engineer · Acme");
  });

  it("rejects a skill the profile does not already claim", () => {
    const review = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "skills",
        itemId: "skill-1",
        field: "skills",
        value: ["TypeScript", "Go", "Kubernetes"],
        reason: "The job asks for Kubernetes.",
      },
    ]);
    expect(review.valid).toEqual([]);
    expect(review.rejected[0]?.reason).toBe("added-content");
  });

  it("rejects a swap that keeps the count identical", () => {
    // The case a length check would wave through, which is why the set rule is
    // membership-based.
    const review = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "skills",
        itemId: "skill-1",
        field: "skills",
        value: ["TypeScript", "Rust"],
        reason: "Rust is in the JD.",
      },
    ]);
    expect(review.rejected[0]?.reason).toBe("added-content");
  });

  it("allows pruning and reordering a set", () => {
    const review = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "skills",
        itemId: "skill-1",
        field: "skills",
        value: ["Go"],
        reason: "Drops what the role does not use.",
      },
    ]);
    expect(review.rejected).toEqual([]);
    expect(review.valid[0]?.after).toEqual(["Go"]);
  });

  it("allows a casing fix, because casing is not a new claim", () => {
    const review = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "projects",
        itemId: "proj-1",
        field: "technologies",
        value: ["TypeScript", "PostgreSQL"],
        reason: "Uses the project's own spelling.",
      },
    ]);
    // "PostgreSQL" is not "Postgres" — a rename *is* a new entry.
    expect(review.rejected[0]?.reason).toBe("added-content");

    const casingOnly = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "projects",
        itemId: "proj-1",
        field: "technologies",
        value: ["typescript", "Postgres"],
        reason: "Consistent casing.",
      },
    ]);
    expect(casingOnly.rejected).toEqual([]);
  });

  it("rejects highlights that grew, and accepts highlights that were condensed", () => {
    const profile = baseProfile();

    const grew = reviewProfileChanges(profile, [
      {
        target: "item",
        section: "experience",
        itemId: "exp-1",
        field: "highlights",
        value: [
          "Shipped the billing rewrite.",
          "Mentored two engineers.",
          "Cut p99 latency by 40%.",
        ],
        reason: "Adds a metric.",
      },
    ]);
    expect(grew.rejected[0]?.reason).toBe("added-content");

    const condensed = reviewProfileChanges(profile, [
      {
        target: "item",
        section: "experience",
        itemId: "exp-1",
        field: "highlights",
        value: ["Shipped the billing rewrite while mentoring two engineers."],
        reason: "One stronger bullet.",
      },
    ]);
    expect(condensed.rejected).toEqual([]);
  });

  it("rejects raw HTML the same way it rejects it from a keyboard", () => {
    const review = reviewProfileChanges(baseProfile(), [
      {
        ...rewriteExperienceSummary,
        value: "<strong>Owned billing</strong> end to end.",
      },
    ]);
    expect(review.rejected[0]?.reason).toBe("invalid-value");
  });

  it("rejects a change to an item that does not exist", () => {
    const review = reviewProfileChanges(baseProfile(), [
      { ...rewriteExperienceSummary, itemId: "exp-does-not-exist" },
    ]);
    expect(review.rejected[0]?.reason).toBe("unknown-item");
  });

  it("rejects a field that is not proposable for that section", () => {
    // Valid on the wire (the enum is flat) and refused here, which is what the
    // per-section allowlist is for.
    const review = reviewProfileChanges(baseProfile(), [
      {
        target: "item",
        section: "experience",
        itemId: "exp-1",
        field: "technologies",
        value: ["TypeScript"],
        reason: "Experience has no technologies field.",
      },
    ]);
    expect(review.rejected[0]?.reason).toBe("field-not-proposable");
  });

  it("rejects a list where text belongs", () => {
    const review = reviewProfileChanges(baseProfile(), [
      { ...rewriteExperienceSummary, value: ["Owned billing."] },
    ]);
    expect(review.rejected[0]?.reason).toBe("wrong-value-type");
  });

  it("rejects a change that changes nothing", () => {
    const review = reviewProfileChanges(baseProfile(), [
      { ...rewriteExperienceSummary, value: "Built things." },
    ]);
    expect(review.rejected[0]?.reason).toBe("unchanged");
  });

  it("reports the normalised value, not the raw one", () => {
    const review = reviewProfileChanges(baseProfile(), [
      { ...rewriteExperienceSummary, value: "  Owned billing.  " },
    ]);
    expect(review.valid[0]?.after).toBe("Owned billing.");
  });

  it("partitions rather than failing the whole batch", () => {
    const review = reviewProfileChanges(baseProfile(), [
      rewriteExperienceSummary,
      { ...rewriteExperienceSummary, itemId: "nope" },
    ]);
    expect(review.valid).toHaveLength(1);
    expect(review.rejected).toHaveLength(1);
  });

  it("accepts a basics summary rewrite and rejects a list in it", () => {
    const accepted = reviewProfileChanges(baseProfile(), [
      {
        target: "basics",
        field: "summary",
        value: "Engineer who owns billing systems end to end.",
        reason: "Says what they do.",
      },
    ]);
    expect(accepted.valid[0]?.label).toBe("Profile summary");

    // `inlineRichTextSchema` forbids bullets in a summary — the model gets the
    // same answer the editor gives a user who tries it.
    const bulleted = reviewProfileChanges(baseProfile(), [
      {
        target: "basics",
        field: "summary",
        value: "- Engineer\n- Owns billing",
        reason: "Scannable.",
      },
    ]);
    expect(bulleted.rejected[0]?.reason).toBe("invalid-value");
  });
});

describe("applyProfileChanges", () => {
  it("writes accepted changes through the edit helpers, immutably", () => {
    const before = baseProfile();
    const after = applyProfileChanges(before, [rewriteExperienceSummary]);
    expect(after.sections.experience[0]?.summary).toBe(
      "Owned billing end to end.",
    );
    expect(before.sections.experience[0]?.summary).toBe("Built things.");
  });

  it("re-runs the guard instead of trusting its caller", () => {
    // The hole this closes: `updateItem` alone would accept this happily — a
    // longer skills array is valid *data*. Only the growth rule knows it is a
    // new claim, so apply has to consult it too.
    expect(() =>
      applyProfileChanges(baseProfile(), [
        {
          target: "item",
          section: "skills",
          itemId: "skill-1",
          field: "skills",
          value: ["TypeScript", "Go", "Kubernetes"],
          reason: "Bypassing review.",
        },
      ]),
    ).toThrow(ProfileDataError);
  });

  it("checks each change against the profile the previous one produced", () => {
    // Two changes that are individually fine and jointly a fabrication: the
    // second re-adds what the first pruned away. Checking against the original
    // profile would let it through.
    expect(() =>
      applyProfileChanges(baseProfile(), [
        {
          target: "item",
          section: "skills",
          itemId: "skill-1",
          field: "skills",
          value: ["TypeScript"],
          reason: "Prune.",
        },
        {
          target: "item",
          section: "skills",
          itemId: "skill-1",
          field: "skills",
          value: ["TypeScript", "Go"],
          reason: "Restore.",
        },
      ]),
    ).toThrow(ProfileDataError);
  });

  it("skips a change that has become a no-op", () => {
    const profile = baseProfile();
    const after = applyProfileChanges(profile, [
      rewriteExperienceSummary,
      rewriteExperienceSummary,
    ]);
    expect(after.sections.experience[0]?.summary).toBe(
      "Owned billing end to end.",
    );
  });

  it("applies changes to different sections in one pass", () => {
    const after = applyProfileChanges(baseProfile(), [
      rewriteExperienceSummary,
      {
        target: "basics",
        field: "summary",
        value: "Billing systems engineer.",
        reason: "Concrete.",
      },
    ]);
    expect(after.basics.summary).toBe("Billing systems engineer.");
    expect(after.sections.experience[0]?.summary).toBe(
      "Owned billing end to end.",
    );
  });

  it("never touches an item's id or provenance", () => {
    const after = applyProfileChanges(baseProfile(), [
      rewriteExperienceSummary,
    ]);
    expect(after.sections.experience[0]?.id).toBe("exp-1");
    expect(after.sections.experience[0]?.source).toBe("manual");
  });
});

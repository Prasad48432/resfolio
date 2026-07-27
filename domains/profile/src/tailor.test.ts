import { describe, expect, it } from "vitest";

import { createItemId } from "./ids";
import { ProfileDataError } from "./errors";
import { createEmptyProfile } from "./seed";
import {
  applyTailoredChanges,
  applyTailoredEmphasis,
  clearTailoring,
  countTailoredFields,
  hasEmphasis,
  reviewTailorPlan,
  tailorPlanSchema,
  type TailorPlan,
} from "./tailor";
import { buildProfileView } from "./view";
import type { Profile, ViewDefinition } from "./index";

/**
 * Job tailoring (docs/architecture/13-ai-layer.md, Phase 5).
 *
 * The same standard as `proposal.test.ts`: every case here is one where letting
 * the plan through would put something false on the copy of someone's resume
 * that an employer reads. Plus the cases specific to writing a `ViewDefinition`
 * — that a tailoring pass must not silently undo the user's own Sections panel
 * choices, and that what it writes still renders.
 */

const ROLE_ID = createItemId();
const OLD_ROLE_ID = createItemId();
const PROJECT_ID = createItemId();
const OTHER_PROJECT_ID = createItemId();

function profileFixture(): Profile {
  const base = createEmptyProfile();
  return {
    ...base,
    basics: { ...base.basics, name: "Ada", summary: "Backend engineer." },
    sections: {
      ...base.sections,
      experience: [
        {
          id: ROLE_ID,
          source: "manual",
          company: "Acme",
          role: "Senior Engineer",
          location: "Remote",
          startDate: "2022-01",
          endDate: "",
          summary: "Owned the billing service.",
          highlights: ["Cut latency by half.", "Mentored two engineers."],
        },
        {
          id: OLD_ROLE_ID,
          source: "manual",
          company: "Globex",
          role: "Engineer",
          location: "Berlin",
          startDate: "2019-03",
          endDate: "2021-12",
          summary: "Worked on internal tools.",
          highlights: [],
        },
      ],
      projects: [
        {
          id: PROJECT_ID,
          source: "manual",
          name: "Orbit",
          description: "A scheduling tool.",
          url: "",
          repoUrl: "",
          startDate: "",
          endDate: "",
          technologies: ["TypeScript", "Postgres"],
          highlights: [],
        },
        {
          id: OTHER_PROJECT_ID,
          source: "manual",
          name: "Ledger",
          description: "A bookkeeping toy.",
          url: "",
          repoUrl: "",
          startDate: "",
          endDate: "",
          technologies: ["Go"],
          highlights: [],
        },
      ],
    },
  };
}

function plan(overrides: Partial<TailorPlan> = {}): TailorPlan {
  return { changes: [], sectionOrder: [], itemOrder: [], ...overrides };
}

describe("tailorPlanSchema", () => {
  it("has no field for hiding content", () => {
    // The mirror of the no-add rule: "drop the retail job" must be
    // unrepresentable, so a model cannot remove a role from a resume the user
    // then sends. Unknown keys are stripped rather than kept.
    const parsed = tailorPlanSchema.parse({
      changes: [],
      sectionOrder: [],
      itemOrder: [{ section: "experience", itemIds: [], exclude: [ROLE_ID] }],
    });
    expect(parsed.itemOrder[0]).not.toHaveProperty("exclude");
  });

  it("accepts an empty plan", () => {
    // "Nothing worth changing" is a legitimate answer, and a schema that
    // demanded at least one rewrite would manufacture one.
    expect(tailorPlanSchema.safeParse(plan()).success).toBe(true);
  });
});

describe("reviewTailorPlan — rewrites", () => {
  it("runs the profile guard, so a grown highlight list is refused", () => {
    const profile = profileFixture();
    const review = reviewTailorPlan(
      profile,
      {},
      plan({
        changes: [
          {
            target: "item",
            section: "experience",
            itemId: ROLE_ID,
            field: "highlights",
            value: [
              "Cut latency by half.",
              "Mentored two engineers.",
              "Led the Kubernetes migration.",
            ],
            reason: "Matches the posting's platform focus.",
          },
        ],
      }),
    );

    expect(review.changes.valid).toHaveLength(0);
    expect(review.changes.rejected[0]?.reason).toBe("added-content");
  });

  it("keeps a rewrite that only sharpens existing prose", () => {
    const review = reviewTailorPlan(
      profileFixture(),
      {},
      plan({
        changes: [
          {
            target: "item",
            section: "experience",
            itemId: ROLE_ID,
            field: "summary",
            value: "Owned billing end to end, including its data model.",
            reason: "The posting is a billing role.",
          },
        ],
      }),
    );

    expect(review.changes.valid).toHaveLength(1);
    expect(review.changes.valid[0]?.label).toBe("Senior Engineer · Acme");
  });

  it("refuses a rewrite naming an item that doesn't exist", () => {
    const review = reviewTailorPlan(
      profileFixture(),
      {},
      plan({
        changes: [
          {
            target: "item",
            section: "experience",
            itemId: createItemId(),
            field: "summary",
            value: "Anything.",
            reason: "Invented target.",
          },
        ],
      }),
    );

    expect(review.changes.rejected[0]?.reason).toBe("unknown-item");
  });
});

describe("reviewTailorPlan — emphasis", () => {
  it("reports an item reorder against what the resume renders today", () => {
    const review = reviewTailorPlan(
      profileFixture(),
      {},
      plan({
        itemOrder: [{ section: "projects", itemIds: [OTHER_PROJECT_ID] }],
      }),
    );

    expect(review.emphasis.sections).toHaveLength(1);
    // The *full* resulting order, not just the id the model named — the review
    // has to show what the resume will look like.
    expect(review.emphasis.sections[0]?.items.map((item) => item.id)).toEqual([
      OTHER_PROJECT_ID,
      PROJECT_ID,
    ]);
    expect(review.emphasis.sections[0]?.items[0]?.label).toBe("Ledger");
  });

  it("reports nothing when the proposed order is already the current one", () => {
    // A user who dragged their projects into a deliberate order must not be told
    // the model is reordering them when it agrees with them.
    const view: ViewDefinition = {
      sections: { projects: { order: [OTHER_PROJECT_ID, PROJECT_ID] } },
    };
    const review = reviewTailorPlan(
      profileFixture(),
      view,
      plan({
        itemOrder: [
          { section: "projects", itemIds: [OTHER_PROJECT_ID, PROJECT_ID] },
        ],
      }),
    );

    expect(hasEmphasis(review.emphasis)).toBe(false);
  });

  it("drops ids the resume doesn't render", () => {
    const view: ViewDefinition = {
      sections: { projects: { exclude: [OTHER_PROJECT_ID] } },
    };
    const review = reviewTailorPlan(
      profileFixture(),
      view,
      plan({
        itemOrder: [
          {
            section: "projects",
            // One hallucinated, one the user hid.
            itemIds: [createItemId(), OTHER_PROJECT_ID, PROJECT_ID],
          },
        ],
      }),
    );

    // Only the visible project remains, which is the order already rendering.
    expect(hasEmphasis(review.emphasis)).toBe(false);
  });

  it("skips a section the user turned off", () => {
    const view: ViewDefinition = { sections: { projects: { include: false } } };
    const review = reviewTailorPlan(
      profileFixture(),
      view,
      plan({
        itemOrder: [{ section: "projects", itemIds: [OTHER_PROJECT_ID] }],
      }),
    );

    expect(review.emphasis.sections).toHaveLength(0);
  });

  it("treats an empty sectionOrder as 'leave it alone'", () => {
    // Completing an empty proposal would render as "the model wants your
    // sections back in default order" — a change nobody proposed.
    const view: ViewDefinition = { sectionOrder: ["projects", "experience"] };
    const review = reviewTailorPlan(profileFixture(), view, plan());

    expect(review.emphasis.sectionOrder).toEqual([]);
  });

  it("completes a partial sectionOrder with the remaining sections", () => {
    const review = reviewTailorPlan(
      profileFixture(),
      {},
      plan({ sectionOrder: ["projects"] }),
    );

    expect(review.emphasis.sectionOrder[0]).toBe("projects");
    expect(review.emphasis.sectionOrder).toHaveLength(9);
    expect(new Set(review.emphasis.sectionOrder).size).toBe(9);
  });

  it("ignores a repeated section rather than merging two orders", () => {
    const review = reviewTailorPlan(
      profileFixture(),
      {},
      plan({
        itemOrder: [
          { section: "projects", itemIds: [OTHER_PROJECT_ID] },
          { section: "projects", itemIds: [PROJECT_ID] },
        ],
      }),
    );

    expect(review.emphasis.sections).toHaveLength(1);
    expect(review.emphasis.sections[0]?.items[0]?.id).toBe(OTHER_PROJECT_ID);
  });
});

describe("applyTailoredChanges", () => {
  it("writes a delta and leaves the profile untouched", () => {
    const profile = profileFixture();
    const view = applyTailoredChanges(profile, {}, [
      {
        target: "item",
        section: "experience",
        itemId: ROLE_ID,
        field: "summary",
        value: "Owned billing end to end.",
        reason: "Posting is billing-heavy.",
      },
    ]);

    expect(view.deltas?.[ROLE_ID]).toEqual({
      summary: "Owned billing end to end.",
    });
    // The single most important assertion in this file.
    expect(profile.sections.experience[0]?.summary).toBe(
      "Owned the billing service.",
    );
  });

  it("sends a basics rewrite to the view, not to basics", () => {
    const profile = profileFixture();
    const view = applyTailoredChanges(profile, {}, [
      {
        target: "basics",
        field: "summary",
        value: "Billing systems engineer.",
        reason: "Leads with the posting's domain.",
      },
    ]);

    expect(view.basics).toEqual({ summary: "Billing systems engineer." });
    expect(profile.basics.summary).toBe("Backend engineer.");
  });

  it("merges per field, keeping an earlier pass' override on the same item", () => {
    const profile = profileFixture();
    const view = applyTailoredChanges(
      profile,
      { deltas: { [ROLE_ID]: { highlights: ["Cut latency by half."] } } },
      [
        {
          target: "item",
          section: "experience",
          itemId: ROLE_ID,
          field: "summary",
          value: "Owned billing end to end.",
          reason: "Domain match.",
        },
      ],
    );

    expect(view.deltas?.[ROLE_ID]).toEqual({
      highlights: ["Cut latency by half."],
      summary: "Owned billing end to end.",
    });
  });

  it("re-runs the guard, because a delta is not validated for growth at render", () => {
    // buildProfileView re-parses every delta through the section schema, so an
    // invalid value can never render — but a fourth highlight is *valid* data.
    // Only the guard knows it is a fourth claim.
    expect(() =>
      applyTailoredChanges(profileFixture(), {}, [
        {
          target: "item",
          section: "projects",
          itemId: PROJECT_ID,
          field: "technologies",
          value: ["TypeScript", "Postgres", "Kubernetes"],
          reason: "The posting wants Kubernetes.",
        },
      ]),
    ).toThrow(ProfileDataError);
  });

  it("writes the normalised value the review showed, not the raw one", () => {
    const view = applyTailoredChanges(profileFixture(), {}, [
      {
        target: "item",
        section: "experience",
        itemId: ROLE_ID,
        field: "summary",
        value: "  Owned billing end to end.  ",
        reason: "Domain match.",
      },
    ]);

    expect(view.deltas?.[ROLE_ID]?.["summary"]).toBe(
      "Owned billing end to end.",
    );
  });

  it("skips a change that matches what is already there", () => {
    const view = applyTailoredChanges(profileFixture(), {}, [
      {
        target: "item",
        section: "experience",
        itemId: ROLE_ID,
        field: "summary",
        value: "Owned the billing service.",
        reason: "No-op.",
      },
    ]);

    expect(view.deltas).toBeUndefined();
  });

  it("produces a view that renders", () => {
    const profile = profileFixture();
    const view = applyTailoredChanges(profile, {}, [
      {
        target: "basics",
        field: "summary",
        value: "Billing systems engineer.",
        reason: "Domain.",
      },
      {
        target: "item",
        section: "experience",
        itemId: ROLE_ID,
        field: "highlights",
        value: ["Cut billing latency by half."],
        reason: "Leads with the metric that matters here.",
      },
    ]);

    const rendered = buildProfileView(profile, view);
    expect(rendered.basics.summary).toBe("Billing systems engineer.");
    const experience = rendered.sections.find(
      (section) => section.key === "experience",
    );
    expect(experience?.items[0]).toMatchObject({
      company: "Acme",
      highlights: ["Cut billing latency by half."],
    });
  });
});

describe("applyTailoredEmphasis", () => {
  it("keeps the user's include and exclude choices", () => {
    // A tailoring pass that reset the Sections panel would put back a job the
    // user deliberately hid — a content change disguised as a reorder.
    const view: ViewDefinition = {
      sections: {
        projects: { exclude: [OTHER_PROJECT_ID] },
        awards: { include: false },
      },
    };

    const next = applyTailoredEmphasis(view, {
      sectionOrder: [],
      sections: [{ section: "projects", itemIds: [PROJECT_ID] }],
    });

    expect(next.sections?.projects).toEqual({
      exclude: [OTHER_PROJECT_ID],
      order: [PROJECT_ID],
    });
    expect(next.sections?.awards).toEqual({ include: false });
  });

  it("stores a canonical section order as absence", () => {
    const view: ViewDefinition = { sectionOrder: ["projects", "experience"] };
    const next = applyTailoredEmphasis(view, {
      sectionOrder: [
        "experience",
        "projects",
        "skills",
        "education",
        "writing",
        "certifications",
        "awards",
        "languages",
        "custom",
      ],
      sections: [],
    });

    expect(next.sectionOrder).toBeUndefined();
  });

  it("leaves the section order alone when none was accepted", () => {
    const view: ViewDefinition = { sectionOrder: ["projects", "experience"] };
    const next = applyTailoredEmphasis(view, {
      sectionOrder: [],
      sections: [],
    });

    expect(next.sectionOrder).toEqual(["projects", "experience"]);
  });
});

describe("countTailoredFields / clearTailoring", () => {
  const view: ViewDefinition = {
    sectionOrder: ["projects", "experience"],
    sections: { projects: { exclude: [OTHER_PROJECT_ID] } },
    basics: { summary: "Tailored." },
    deltas: {
      [ROLE_ID]: { summary: "One.", highlights: ["Two."] },
      [PROJECT_ID]: { description: "Three." },
    },
  };

  it("counts fields, not items", () => {
    expect(countTailoredFields(view)).toBe(4);
    expect(countTailoredFields({})).toBe(0);
  });

  it("clears overrides and keeps the user's own layout", () => {
    const cleared = clearTailoring(view);

    expect(cleared.deltas).toBeUndefined();
    expect(cleared.basics).toBeUndefined();
    expect(cleared.sectionOrder).toEqual(["projects", "experience"]);
    expect(cleared.sections?.projects).toEqual({
      exclude: [OTHER_PROJECT_ID],
    });
  });
});

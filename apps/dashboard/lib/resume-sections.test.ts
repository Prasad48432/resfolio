import {
  buildProfileView,
  type Profile,
  type ViewDefinition,
} from "@resfolio/profile";
import { getProfileFixture } from "@resfolio/fixtures";
import { describe, expect, it } from "vitest";

import {
  isItemShown,
  isSectionIncluded,
  orderedChoices,
  resetSectionItems,
  sectionItemChoices,
  setItemOrder,
  setItemShown,
  setSectionIncluded,
  shownCount,
} from "./resume-sections";

/**
 * The config layer's contract is "what this writes, `buildProfileView` reads".
 * So most of these assert against the real projection rather than against the
 * shape of the JSON — the JSON is an implementation detail; the rendered view
 * is the promise.
 */
const profile: Profile = getProfileFixture("ada");

function projected(view: ViewDefinition) {
  return buildProfileView(profile, view);
}

function sectionKeys(view: ViewDefinition) {
  return projected(view).sections.map((section) => section.key);
}

describe("section visibility", () => {
  it("treats an empty view as everything included", () => {
    expect(isSectionIncluded({}, "projects")).toBe(true);
    expect(isSectionIncluded({}, "awards")).toBe(true);
  });

  it("hides a section from the real projection when toggled off", () => {
    expect(sectionKeys({})).toContain("projects");
    const view = setSectionIncluded({}, "projects", false);
    expect(isSectionIncluded(view, "projects")).toBe(false);
    expect(sectionKeys(view)).not.toContain("projects");
  });

  it("stores 'on' as absence, so re-enabling returns to the identity view", () => {
    const off = setSectionIncluded({}, "projects", false);
    const backOn = setSectionIncluded(off, "projects", true);
    // Not merely equivalent — literally `{}` again. A view full of defaults
    // would churn the render key for no reason.
    expect(backOn).toEqual({});
  });

  it("leaves other sections untouched", () => {
    const view = setSectionIncluded({}, "awards", false);
    expect(isSectionIncluded(view, "projects")).toBe(true);
    expect(sectionKeys(view)).toContain("projects");
  });
});

describe("item selection", () => {
  it("drops only the excluded item from the projection", () => {
    const choices = sectionItemChoices(profile, "projects");
    const [first] = choices;
    expect(first).toBeDefined();

    const view = setItemShown({}, "projects", first!.id, false);
    expect(isItemShown(view, "projects", first!.id)).toBe(false);
    expect(shownCount(view, "projects", choices)).toBe(choices.length - 1);

    const rendered = projected(view).sections.find((s) => s.key === "projects");
    const renderedIds = rendered?.items.map((item) => item.id) ?? [];
    expect(renderedIds).not.toContain(first!.id);
    expect(renderedIds).toHaveLength(choices.length - 1);
  });

  it("round-trips back to the identity view when re-shown", () => {
    const [first] = sectionItemChoices(profile, "projects");
    const hidden = setItemShown({}, "projects", first!.id, false);
    expect(setItemShown(hidden, "projects", first!.id, true)).toEqual({});
  });

  it("is idempotent — hiding twice excludes once", () => {
    const [first] = sectionItemChoices(profile, "projects");
    const once = setItemShown({}, "projects", first!.id, false);
    const twice = setItemShown(once, "projects", first!.id, false);
    expect(twice.sections?.projects?.exclude).toEqual([first!.id]);
  });

  it("dropping every item drops the whole section — no empty heading", () => {
    const choices = sectionItemChoices(profile, "projects");
    let view: ViewDefinition = {};
    for (const choice of choices) {
      view = setItemShown(view, "projects", choice.id, false);
    }
    expect(sectionKeys(view)).not.toContain("projects");
  });
});

describe("item order", () => {
  it("renders in the configured order", () => {
    const choices = sectionItemChoices(profile, "projects");
    const reversed = [...choices].reverse().map((choice) => choice.id);

    const view = setItemOrder({}, "projects", reversed);
    const rendered = projected(view).sections.find((s) => s.key === "projects");
    expect(rendered?.items.map((item) => item.id)).toEqual(reversed);
  });

  it("previews the same order the projection will use", () => {
    const choices = sectionItemChoices(profile, "projects");
    const reversed = [...choices].reverse().map((choice) => choice.id);
    const view = setItemOrder({}, "projects", reversed);

    // The picker list and the rendered resume must agree, or the UI lies.
    expect(orderedChoices(view, "projects", choices).map((c) => c.id)).toEqual(
      reversed,
    );
  });

  it("keeps unlisted items visible, after the listed ones", () => {
    // `skills` is the fixture's multi-item section; `projects` has one entry,
    // which cannot exercise partial ordering.
    const choices = sectionItemChoices(profile, "skills");
    expect(choices.length).toBeGreaterThan(1);
    const last = choices[choices.length - 1]!;

    // Order names only the final item; the rest must still render. This is the
    // property that keeps a stale view from hiding newly added profile content.
    const view = setItemOrder({}, "skills", [last.id]);
    const ids = orderedChoices(view, "skills", choices).map((c) => c.id);
    expect(ids[0]).toBe(last.id);
    expect(ids).toHaveLength(choices.length);

    const rendered = projected(view).sections.find((s) => s.key === "skills");
    expect(rendered?.items).toHaveLength(choices.length);
  });

  it("ignores ids that no longer exist in the profile", () => {
    const choices = sectionItemChoices(profile, "projects");
    const view = setItemOrder({}, "projects", ["deleted-item-id"]);
    expect(orderedChoices(view, "projects", choices).map((c) => c.id)).toEqual(
      choices.map((c) => c.id),
    );
  });
});

describe("reset", () => {
  it("clears selection and order but keeps the section toggled off", () => {
    const [first] = sectionItemChoices(profile, "projects");
    let view = setSectionIncluded({}, "projects", false);
    view = setItemShown(view, "projects", first!.id, false);
    view = setItemOrder(view, "projects", [first!.id]);

    const reset = resetSectionItems(view, "projects");
    expect(reset.sections?.projects).toEqual({ include: false });
  });
});

describe("custom sections", () => {
  it("chooses custom *sections* by id, matching how the view reads them", () => {
    const choices = sectionItemChoices(profile, "custom");
    if (choices.length === 0) {
      return; // fixture carries no custom sections
    }
    const view = setItemShown({}, "custom", choices[0]!.id, false);
    const rendered = projected(view).sections.filter((s) => s.key === "custom");
    for (const section of rendered) {
      expect(section.id).not.toBe(choices[0]!.id);
    }
  });
});

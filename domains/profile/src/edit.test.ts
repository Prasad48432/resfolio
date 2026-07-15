import { describe, expect, it } from "vitest";

import { ProfileDataError } from "./errors";
import {
  addItem,
  moveItem,
  removeItem,
  updateBasics,
  updateItem,
} from "./edit";
import { createEmptyProfile } from "./seed";
import type { Profile } from "./schema/profile";

function withThree(): Profile {
  let profile = createEmptyProfile();
  for (const id of ["a", "b", "c"]) {
    profile = addItem(profile, "projects", {
      id,
      source: "manual",
      name: `Project ${id}`,
      description: "",
      technologies: [],
      highlights: [],
    });
  }
  return profile;
}

describe("updateBasics", () => {
  it("patches valid fields immutably", () => {
    const before = createEmptyProfile();
    const after = updateBasics(before, { name: "Nia" });
    expect(after.basics.name).toBe("Nia");
    expect(before.basics.name).toBe("");
  });

  it("rejects an invalid patch", () => {
    expect(() =>
      updateBasics(createEmptyProfile(), { avatarUrl: "javascript:1" }),
    ).toThrow(ProfileDataError);
  });
});

describe("addItem", () => {
  it("appends by default and inserts at an index", () => {
    let profile = withThree();
    profile = addItem(
      profile,
      "projects",
      {
        id: "x",
        source: "manual",
        name: "Inserted",
        description: "",
        technologies: [],
        highlights: [],
      },
      1,
    );
    expect(profile.sections.projects.map((item) => item.id)).toEqual([
      "a",
      "x",
      "b",
      "c",
    ]);
  });

  it("rejects a duplicate id", () => {
    const profile = withThree();
    expect(() =>
      addItem(profile, "projects", {
        id: "a",
        source: "manual",
        name: "Dup",
        description: "",
        technologies: [],
        highlights: [],
      }),
    ).toThrow(/already exists/);
  });

  it("rejects an out-of-range index", () => {
    expect(() =>
      addItem(
        createEmptyProfile(),
        "projects",
        {
          id: "z",
          source: "manual",
          name: "Z",
          description: "",
          technologies: [],
          highlights: [],
        },
        5,
      ),
    ).toThrow(/out of range/);
  });
});

describe("updateItem", () => {
  it("patches a found item", () => {
    const profile = updateItem(withThree(), "projects", "b", {
      name: "Renamed",
    });
    expect(profile.sections.projects[1]?.name).toBe("Renamed");
  });

  it("ignores id/source/sourceId in the patch", () => {
    const profile = updateItem(withThree(), "projects", "b", {
      // @ts-expect-error — provenance is not patchable by type either
      id: "hacked",
      source: "github",
    });
    expect(profile.sections.projects[1]?.id).toBe("b");
    expect(profile.sections.projects[1]?.source).toBe("manual");
  });

  it("throws for a missing id", () => {
    expect(() =>
      updateItem(withThree(), "projects", "ghost", { name: "x" }),
    ).toThrow(/No projects item/);
  });
});

describe("removeItem", () => {
  it("removes a found item", () => {
    const profile = removeItem(withThree(), "projects", "b");
    expect(profile.sections.projects.map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("throws for a missing id", () => {
    expect(() => removeItem(withThree(), "projects", "ghost")).toThrow(
      ProfileDataError,
    );
  });
});

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(
      moveItem(withThree(), "projects", 0, 2).sections.projects.map(
        (i) => i.id,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(
      moveItem(withThree(), "projects", 2, 0).sections.projects.map(
        (i) => i.id,
      ),
    ).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when from === to", () => {
    const profile = withThree();
    expect(moveItem(profile, "projects", 1, 1)).toBe(profile);
  });

  it("throws for out-of-range indices", () => {
    expect(() => moveItem(withThree(), "projects", 0, 9)).toThrow(
      ProfileDataError,
    );
  });
});

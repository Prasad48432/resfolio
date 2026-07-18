import { describe, expect, it } from "vitest";

import { ProfileDataError } from "./errors";
import { createEmptyProfile } from "./seed";
import { addItem } from "./edit";
import { buildProfileView, type ViewDefinition } from "./view";
import type { Profile } from "./schema/profile";

function sample(): Profile {
  let profile = createEmptyProfile();
  profile = addItem(profile, "experience", {
    id: "a",
    source: "manual",
    company: "Alpha",
    role: "Engineer",
    location: "",
    summary: "",
    highlights: ["kept", "  "], // second is whitespace-only
  });
  profile = addItem(profile, "experience", {
    id: "b",
    source: "manual",
    company: "Beta",
    role: "Engineer",
    location: "",
    summary: "",
    highlights: [],
  });
  profile = addItem(profile, "skills", {
    id: "s",
    source: "manual",
    name: "Core",
    skills: ["Rust", "", "Go"],
  });
  return profile;
}

describe("buildProfileView — identity view", () => {
  it("renders sections in canonical order, omitting empty ones", () => {
    const view = buildProfileView(sample());
    expect(view.sections.map((section) => section.key)).toEqual([
      "experience",
      "skills",
    ]);
  });

  it("drops whitespace-only highlights and skills at read time", () => {
    const view = buildProfileView(sample());
    const experience = view.sections.find((s) => s.key === "experience");
    const skills = view.sections.find((s) => s.key === "skills");
    expect(
      experience?.key === "experience" && experience.items[0]?.highlights,
    ).toEqual(["kept"]);
    expect(skills?.key === "skills" && skills.items[0]?.skills).toEqual([
      "Rust",
      "Go",
    ]);
  });

  it("omits an entirely empty profile's sections", () => {
    expect(buildProfileView(createEmptyProfile()).sections).toEqual([]);
  });
});

describe("buildProfileView — selection & ordering", () => {
  it("reorders items by explicit order, unlisted follow in profile order", () => {
    const view = buildProfileView(sample(), {
      sections: { experience: { order: ["b", "a"] } },
    });
    const experience = view.sections.find((s) => s.key === "experience");
    expect(
      experience?.key === "experience" &&
        experience.items.map((item) => item.id),
    ).toEqual(["b", "a"]);
  });

  it("excludes items by id", () => {
    const view = buildProfileView(sample(), {
      sections: { experience: { exclude: ["a"] } },
    });
    const experience = view.sections.find((s) => s.key === "experience");
    expect(
      experience?.key === "experience" &&
        experience.items.map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("drops a section when include is false", () => {
    const view = buildProfileView(sample(), {
      sections: { experience: { include: false } },
    });
    expect(view.sections.map((s) => s.key)).toEqual(["skills"]);
  });

  it("honours sectionOrder, then canonical order for the rest", () => {
    const view = buildProfileView(sample(), {
      sectionOrder: ["skills", "experience"],
    });
    expect(view.sections.map((s) => s.key)).toEqual(["skills", "experience"]);
  });

  it("ignores unknown ids in order without error", () => {
    const view = buildProfileView(sample(), {
      sections: { experience: { order: ["ghost", "a"] } },
    });
    const experience = view.sections.find((s) => s.key === "experience");
    expect(
      experience?.key === "experience" &&
        experience.items.map((item) => item.id),
    ).toEqual(["a", "b"]);
  });
});

describe("buildProfileView — deltas (tailoring)", () => {
  it("applies a per-item field override", () => {
    const view = buildProfileView(sample(), {
      deltas: { a: { role: "Staff Engineer" } },
    });
    const experience = view.sections.find((s) => s.key === "experience");
    expect(experience?.key === "experience" && experience.items[0]?.role).toBe(
      "Staff Engineer",
    );
  });

  it("never lets a delta change id or provenance", () => {
    const view = buildProfileView(sample(), {
      deltas: { a: { id: "hacked", source: "linkedin" } },
    });
    const experience = view.sections.find((s) => s.key === "experience");
    const item =
      experience?.key === "experience" ? experience.items[0] : undefined;
    expect(item?.id).toBe("a");
    expect(item?.source).toBe("manual");
  });

  it("applies a basics override", () => {
    const profile = addItem(createEmptyProfile(), "skills", {
      id: "s",
      source: "manual",
      name: "Core",
      skills: ["x"],
    });
    const view = buildProfileView(profile, {
      basics: { summary: "Tailored summary" },
    });
    expect(view.basics.summary).toBe("Tailored summary");
  });

  it("rejects a delta that produces an invalid item", () => {
    expect(() =>
      buildProfileView(sample(), { deltas: { a: { company: "" } } }),
    ).toThrow(ProfileDataError);
  });

  it("does not mutate the input profile", () => {
    const profile = sample();
    const snapshot = structuredClone(profile);
    buildProfileView(profile, { deltas: { a: { role: "Changed" } } });
    expect(profile).toEqual(snapshot);
  });
});

describe("buildProfileView — determinism", () => {
  it("produces deeply equal output for identical inputs", () => {
    const profile = sample();
    const definition: ViewDefinition = {
      sectionOrder: ["skills", "experience"],
      sections: { experience: { order: ["b", "a"] } },
      deltas: { a: { role: "Lead" } },
    };
    expect(buildProfileView(profile, definition)).toEqual(
      buildProfileView(profile, definition),
    );
  });
});

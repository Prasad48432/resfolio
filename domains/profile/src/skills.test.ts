import { describe, expect, it } from "vitest";

import { createItemId } from "./ids";
import { createEmptyProfile } from "./seed";
import { SECTION_ITEM_SCHEMAS } from "./schema/profile";
import type { Profile } from "./schema/profile";
import {
  addDemonstratedSkills,
  demonstrationHaystack,
  findDemonstratedSkills,
  termAppearsIn,
} from "./skills";

/**
 * The rule under test: **a skill may be listed only if the profile already
 * demonstrates it elsewhere.**
 *
 * This is the one place in the package where a set-valued field is allowed to
 * grow, so the tests are written against the ways it could be made to grow
 * wrongly rather than against the happy path.
 */

const GROUP_ID = createItemId();
const OTHER_GROUP_ID = createItemId();
const PROJECT_ID = createItemId();
const EXPERIENCE_ID = createItemId();

function profile(patch: { skills?: string[]; other?: string[] } = {}): Profile {
  const base = createEmptyProfile();
  return {
    ...base,
    sections: {
      ...base.sections,
      experience: [
        SECTION_ITEM_SCHEMAS.experience.parse({
          id: EXPERIENCE_ID,
          source: "manual",
          company: "Revival Labs",
          role: "Full Stack AI Developer",
          startDate: "2025-07",
          highlights: ["Containerised the build with Docker."],
        }),
      ],
      projects: [
        SECTION_ITEM_SCHEMAS.projects.parse({
          id: PROJECT_ID,
          source: "manual",
          name: "Brainground",
          description: "A real-time quiz platform.",
          technologies: patch.other ?? ["Docker", "PostgreSQL", "Redis"],
        }),
      ],
      skills: [
        SECTION_ITEM_SCHEMAS.skills.parse({
          id: GROUP_ID,
          source: "manual",
          name: "DevOps & Tools",
          skills: patch.skills ?? ["PostgreSQL", "Redis"],
        }),
        SECTION_ITEM_SCHEMAS.skills.parse({
          id: OTHER_GROUP_ID,
          source: "manual",
          name: "Languages",
          skills: ["TypeScript"],
        }),
      ],
    },
  } as Profile;
}

describe("termAppearsIn", () => {
  it("matches on word boundaries, not substrings", () => {
    // The damaging direction: telling somebody their profile says something it
    // doesn't. "Google" must not vouch for "Go".
    expect(termAppearsIn("Worked at Google.", "Go")).toBe(false);
    expect(termAppearsIn("Wrote services in Go.", "Go")).toBe(true);
  });

  it("handles terms whose edges are not word characters", () => {
    expect(termAppearsIn("Shipped a C++ SDK.", "C++")).toBe(true);
    expect(termAppearsIn("Used .NET at Acme.", ".NET")).toBe(true);
  });

  it("is false for an empty term rather than matching everything", () => {
    expect(termAppearsIn("anything", "  ")).toBe(false);
  });
});

describe("demonstrationHaystack", () => {
  it("excludes the skills section", () => {
    // Load-bearing: including it would make every listed skill "demonstrated",
    // so a term could vouch for its own copy in a second group.
    const haystack = demonstrationHaystack(profile());
    expect(haystack).not.toContain("DevOps & Tools");
    expect(haystack).toContain("Brainground");
  });
});

describe("findDemonstratedSkills", () => {
  it("offers a term the profile demonstrates and does not list", () => {
    const found = findDemonstratedSkills(profile(), ["Docker"]);

    expect(found).toHaveLength(1);
    expect(found[0]?.skill).toBe("Docker");
  });

  it("shows where it already appears, so the tick is a decision not a claim", () => {
    const [docker] = findDemonstratedSkills(profile(), ["Docker"]);

    // Both the project's technologies and the experience bullet mention it.
    expect(docker?.evidence.map((ref) => ref.section).sort()).toEqual([
      "experience",
      "projects",
    ]);
  });

  it("skips a term that is already listed", () => {
    expect(findDemonstratedSkills(profile(), ["PostgreSQL"])).toEqual([]);
  });

  it("skips a term the profile never mentions", () => {
    // This is the no-fabrication rule doing its job: OWASP is a real gap and
    // stays one.
    expect(findDemonstratedSkills(profile(), ["OWASP"])).toEqual([]);
  });

  it("keeps the posting's order and collapses repeats", () => {
    const found = findDemonstratedSkills(profile(), [
      "Docker",
      "docker",
      "OWASP",
    ]);
    expect(found.map((entry) => entry.skill)).toEqual(["Docker"]);
  });

  it("suggests the group that already holds the most sibling technologies", () => {
    // Docker sits beside PostgreSQL and Redis on the project, and "DevOps &
    // Tools" already holds both — a better answer than "the first group", and
    // derived from the user's own grouping rather than a taxonomy.
    const [docker] = findDemonstratedSkills(profile(), ["Docker"]);
    expect(docker?.suggestedGroupId).toBe(GROUP_ID);
  });

  it("falls back to a group rather than returning nowhere to put it", () => {
    const found = findDemonstratedSkills(
      profile({ other: ["Docker"], skills: [] }),
      ["Docker"],
    );
    expect(found[0]?.suggestedGroupId).toBe(GROUP_ID);
  });
});

describe("addDemonstratedSkills", () => {
  it("lists a demonstrated skill in the chosen group", () => {
    const next = addDemonstratedSkills(profile(), [
      { groupId: GROUP_ID, skill: "Docker" },
    ]);

    expect(next.sections.skills[0]?.skills).toEqual([
      "PostgreSQL",
      "Redis",
      "Docker",
    ]);
  });

  it("refuses a skill the profile does not demonstrate", () => {
    // The guarantee. No argument a caller can pass adds a term the profile does
    // not already contain — the evidence is re-derived here, never trusted.
    expect(() =>
      addDemonstratedSkills(profile(), [
        { groupId: GROUP_ID, skill: "Kubernetes" },
      ]),
    ).toThrow(/nothing else in this profile mentions it/i);
  });

  it("refuses an unknown group rather than creating one", () => {
    expect(() =>
      addDemonstratedSkills(profile(), [
        { groupId: "not-a-group", skill: "Docker" },
      ]),
    ).toThrow(/No skill group/i);
  });

  it("cannot move a listed skill into a second group on its own authority", () => {
    // TypeScript is listed in "Languages" and mentioned nowhere else, so it has
    // no demonstration of its own — the skills section is not evidence.
    expect(() =>
      addDemonstratedSkills(profile(), [
        { groupId: GROUP_ID, skill: "TypeScript" },
      ]),
    ).toThrow(/nothing else in this profile mentions it/i);
  });

  it("skips a duplicate rather than failing the batch", () => {
    const next = addDemonstratedSkills(profile(), [
      { groupId: GROUP_ID, skill: "Docker" },
      { groupId: GROUP_ID, skill: "docker" },
    ]);
    expect(next.sections.skills[0]?.skills).toHaveLength(3);
  });

  it("leaves the profile untouched apart from the group it names", () => {
    const before = profile();
    const next = addDemonstratedSkills(before, [
      { groupId: GROUP_ID, skill: "Docker" },
    ]);

    expect(next.sections.skills[1]).toEqual(before.sections.skills[1]);
    expect(next.sections.experience).toEqual(before.sections.experience);
    expect(before.sections.skills[0]?.skills).toEqual(["PostgreSQL", "Redis"]);
  });
});

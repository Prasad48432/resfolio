import { addItem, createEmptyProfile, createItemId } from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import {
  buildBasicsPatch,
  buildProfileItem,
  contentFingerprint,
  detectUserEdit,
  extractAppliedPayload,
  sectionForKind,
} from "./apply";
import { candidateItemSchema, type CandidateItem } from "./candidate";
import { CandidateApplyError } from "./errors";

/**
 * The pure half of Apply: candidate → Profile mapping with provenance, and
 * the applied-content fingerprint that later powers the user-edit detector
 * (the never-overwrite rule's input).
 */

function projectCandidate(): CandidateItem {
  return candidateItemSchema.parse({
    kind: "project",
    externalId: "42",
    url: "https://github.com/u/repo",
    title: "repo",
    raw: { anything: true },
    payload: {
      name: "repo",
      description: "A tool.",
      repoUrl: "https://github.com/u/repo",
      technologies: ["ts"],
      highlights: [],
    },
  });
}

function articleCandidate(): CandidateItem {
  return candidateItemSchema.parse({
    kind: "article",
    externalId: "post-1",
    title: "Hello",
    raw: {},
    payload: { title: "Hello", publisher: "Blog", summary: "Hi." },
  });
}

describe("buildProfileItem", () => {
  it("stamps provenance: fresh id, provider source, externalId → sourceId", () => {
    const built = buildProfileItem(projectCandidate(), "github");
    expect(built.sectionKey).toBe("projects");
    expect(built.item.id).toMatch(/./);
    expect(built.item.source).toBe("github");
    expect(built.item.sourceId).toBe("42");
    if (built.sectionKey === "projects") {
      expect(built.item.name).toBe("repo");
      expect(built.item.technologies).toEqual(["ts"]);
    }
  });

  it("maps kinds to their canonical sections (sectionForKind)", () => {
    expect(buildProfileItem(articleCandidate(), "rss").sectionKey).toBe(
      "writing",
    );
    expect(sectionForKind("contribution")).toBe("projects");
    expect(sectionForKind("talk")).toBe("custom");
    expect(sectionForKind("unclassified")).toBe("custom");
    expect(sectionForKind("profileBasics")).toBe("basics");
  });

  it("builds the multi-section kinds onto their own sections (the LinkedIn mapping)", () => {
    const experience = candidateItemSchema.parse({
      kind: "experience",
      externalId: "pos-1",
      title: "Acme — Engineer",
      raw: {},
      payload: { company: "Acme", role: "Engineer" },
    });
    const builtExperience = buildProfileItem(experience, "linkedin");
    expect(builtExperience.sectionKey).toBe("experience");
    expect(builtExperience.item.source).toBe("linkedin");
    expect(builtExperience.item.sourceId).toBe("pos-1");

    const skills = candidateItemSchema.parse({
      kind: "skillGroup",
      externalId: "skills",
      title: "Skills",
      raw: {},
      payload: { name: "Languages", skills: ["TypeScript", "SQL"] },
    });
    const builtSkills = buildProfileItem(skills, "linkedin");
    expect(builtSkills.sectionKey).toBe("skills");
    if (builtSkills.sectionKey === "skills") {
      expect(builtSkills.item.skills).toEqual(["TypeScript", "SQL"]);
    }

    const certification = candidateItemSchema.parse({
      kind: "certification",
      externalId: "cert-1",
      title: "AWS SAA",
      raw: {},
      payload: { name: "AWS Solutions Architect", issuer: "AWS" },
    });
    expect(buildProfileItem(certification, "linkedin").sectionKey).toBe(
      "certifications",
    );

    const education = candidateItemSchema.parse({
      kind: "education",
      externalId: "edu-1",
      title: "MIT",
      raw: {},
      payload: { institution: "MIT", degree: "BSc" },
    });
    expect(buildProfileItem(education, "linkedin").sectionKey).toBe(
      "education",
    );
  });

  it("maps an unclassified payload onto a custom item (text → summary, date → startDate)", () => {
    const unclassified = candidateItemSchema.parse({
      kind: "unclassified",
      externalId: "odd-1",
      title: "Something odd",
      raw: {},
      payload: {
        title: "Something odd",
        text: "Content the connector couldn't type.",
        url: "https://example.com/odd",
        date: "2026-01-15",
      },
    });
    const built = buildProfileItem(unclassified, "rss");
    expect(built.sectionKey).toBe("custom");
    if (built.sectionKey === "custom") {
      expect(built.item.title).toBe("Something odd");
      expect(built.item.summary).toBe("Content the connector couldn't type.");
      expect(built.item.startDate).toBe("2026-01-15");
      expect(built.item.url).toBe("https://example.com/odd");
    }
  });

  it("rejects a connector id that is not a profile ItemSource", () => {
    expect(() => buildProfileItem(projectCandidate(), "dribbble")).toThrow(
      CandidateApplyError,
    );
  });

  it("rejects profileBasics (patched, not added)", () => {
    const basics = candidateItemSchema.parse({
      kind: "profileBasics",
      externalId: "me",
      title: "Profile",
      raw: {},
      payload: { name: "Ada" },
    });
    expect(() => buildProfileItem(basics, "github")).toThrow(
      CandidateApplyError,
    );
  });
});

describe("buildBasicsPatch", () => {
  it("drops empty fields so an import never blanks existing content", () => {
    const basics = candidateItemSchema.parse({
      kind: "profileBasics",
      externalId: "me",
      title: "Profile",
      raw: {},
      payload: { name: "Ada Lovelace", headline: "", location: "London" },
    });
    if (basics.kind !== "profileBasics") {
      throw new Error("unreachable");
    }
    expect(buildBasicsPatch(basics)).toEqual({
      name: "Ada Lovelace",
      location: "London",
    });
  });
});

describe("contentFingerprint + extractAppliedPayload (the user-edit detector)", () => {
  it("an untouched applied item fingerprints identically to its candidate", () => {
    const candidate = projectCandidate();
    const built = buildProfileItem(candidate, "github");
    if (built.sectionKey !== "projects") {
      throw new Error("unreachable");
    }
    const profile = addItem(createEmptyProfile(), "projects", built.item);

    const extracted = extractAppliedPayload(
      profile,
      candidate.kind,
      built.item.id,
    );
    expect(extracted).not.toBeNull();
    expect(
      contentFingerprint(candidate.kind, extracted as Record<string, unknown>),
    ).toBe(
      contentFingerprint(
        candidate.kind,
        candidate.payload as Record<string, unknown>,
      ),
    );
  });

  it("a user edit shifts the fingerprint", () => {
    const candidate = projectCandidate();
    const built = buildProfileItem(candidate, "github");
    if (built.sectionKey !== "projects") {
      throw new Error("unreachable");
    }
    const profile = addItem(createEmptyProfile(), "projects", {
      ...built.item,
      description: "My rewritten description.",
    });
    const extracted = extractAppliedPayload(profile, "project", built.item.id);
    expect(
      contentFingerprint("project", extracted as Record<string, unknown>),
    ).not.toBe(
      contentFingerprint(
        "project",
        candidate.payload as Record<string, unknown>,
      ),
    );
  });

  it("a removed item extracts as null (deletion counts as an edit)", () => {
    expect(
      extractAppliedPayload(createEmptyProfile(), "project", "missing-id"),
    ).toBeNull();
  });

  it("finds a talk across custom sections", () => {
    const talkId = createItemId();
    const profile = addItem(createEmptyProfile(), "custom", {
      id: createItemId(),
      source: "manual" as const,
      title: "Talks",
      items: [
        {
          id: talkId,
          source: "manual" as const,
          title: "My conference talk",
          subtitle: "",
          summary: "",
          highlights: [],
        },
      ],
    });
    const extracted = extractAppliedPayload(profile, "talk", talkId);
    expect(extracted).toMatchObject({ title: "My conference talk" });
    expect(extracted).not.toHaveProperty("id");
    expect(extracted).not.toHaveProperty("source");
  });

  it("extracts the basics subset with empties dropped", () => {
    const profile = createEmptyProfile();
    profile.basics.name = "Ada";
    const extracted = extractAppliedPayload(profile, "profileBasics", null);
    expect(extracted).toEqual({ name: "Ada" });
  });
});

describe("detectUserEdit (the re-import warning's input)", () => {
  function importedProfile() {
    const candidate = projectCandidate();
    const built = buildProfileItem(candidate, "github");
    if (built.sectionKey !== "projects") {
      throw new Error("unreachable");
    }
    const profile = addItem(createEmptyProfile(), "projects", built.item);
    const applied = extractAppliedPayload(profile, "project", built.item.id);
    const appliedFingerprint = contentFingerprint(
      "project",
      applied as Record<string, unknown>,
    );
    return { profile, itemId: built.item.id, appliedFingerprint };
  }

  it("is false right after an import — nothing of the user's to protect", () => {
    const { profile, itemId, appliedFingerprint } = importedProfile();
    expect(detectUserEdit(profile, "project", itemId, appliedFingerprint)).toBe(
      false,
    );
  });

  it("is true after the user edits their copy", () => {
    const { profile, itemId, appliedFingerprint } = importedProfile();
    const section = profile.sections.projects.map((item) =>
      item.id === itemId ? { ...item, description: "My own words." } : item,
    );
    const edited = { ...profile, sections: { ...profile.sections, projects: section } };
    expect(detectUserEdit(edited, "project", itemId, appliedFingerprint)).toBe(
      true,
    );
  });

  it("is true when the user removed the item — deletion counts as an edit", () => {
    const { profile, appliedFingerprint } = importedProfile();
    void profile;
    expect(
      detectUserEdit(
        createEmptyProfile(),
        "project",
        "gone-id",
        appliedFingerprint,
      ),
    ).toBe(true);
  });

  it("is false when never imported (no applied fingerprint)", () => {
    expect(detectUserEdit(createEmptyProfile(), "project", null, null)).toBe(
      false,
    );
  });
});

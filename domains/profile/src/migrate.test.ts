import { describe, expect, it } from "vitest";

import { ProfileDataError } from "./errors";
import { migrateProfile } from "./migrate";
import { PROFILE_SCHEMA_VERSION } from "./schema/profile";
import { createEmptyProfile, createSeedProfile } from "./seed";

/**
 * The migration chain against a corpus of real-shaped historical profiles
 * (docs/architecture/01-profile-engine.md). Today only v1 exists, so the
 * corpus is v1 blobs and the tests pin the *contract* every future step
 * must keep: any stored version migrates to the latest and validates, and
 * malformed/newer data fails loudly rather than silently corrupting.
 *
 * When schema v2 lands: add a v1-shaped blob here, add the v1→v2 step in
 * migrate.ts, and assert the upgraded fields — this file is the guard.
 */

// Raw stored blobs — intentionally plain objects (not built through current
// builders), the way a real historical row looks in JSONB.
const V1_CORPUS: { name: string; data: unknown }[] = [
  { name: "empty v1", data: createEmptyProfile() },
  {
    name: "seeded v1",
    data: createSeedProfile({ name: "Rae", email: "rae@example.com" }),
  },
  {
    name: "hand-shaped v1 with provenance",
    data: {
      schemaVersion: 1,
      basics: {
        name: "Lee",
        headline: "",
        summary: "",
        location: "",
        contacts: {},
        links: [],
      },
      sections: {
        experience: [
          {
            id: "exp-1",
            source: "github",
            sourceId: "octocat/repo",
            company: "GitHub",
            role: "Maintainer",
            location: "",
            summary: "",
            highlights: [],
          },
        ],
        projects: [],
        skills: [],
        education: [],
        writing: [],
        certifications: [],
        awards: [],
        languages: [],
        custom: [],
      },
    },
  },
];

describe("migrateProfile", () => {
  it.each(V1_CORPUS)("migrates and validates: $name", ({ data }) => {
    const migrated = migrateProfile(data);
    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(() => migrateProfile(migrated)).not.toThrow();
  });

  it("preserves provenance through migration", () => {
    const migrated = migrateProfile(V1_CORPUS[2]!.data);
    const item = migrated.sections.experience[0];
    expect(item?.source).toBe("github");
    expect(item?.sourceId).toBe("octocat/repo");
  });

  it("is idempotent for already-current data", () => {
    const seeded = createSeedProfile();
    expect(migrateProfile(seeded)).toEqual(
      migrateProfile(migrateProfile(seeded)),
    );
  });

  it("rejects data with no valid schemaVersion", () => {
    expect(() => migrateProfile({ basics: {} })).toThrow(ProfileDataError);
    expect(() => migrateProfile(null)).toThrow(ProfileDataError);
    expect(() => migrateProfile([])).toThrow(ProfileDataError);
  });

  it("refuses data newer than the supported version", () => {
    const future = { ...createEmptyProfile(), schemaVersion: 999 };
    expect(() => migrateProfile(future)).toThrow(/newer than the supported/);
  });

  it("rejects structurally invalid v1 data", () => {
    const broken = {
      schemaVersion: 1,
      basics: { links: "not-an-array" },
      sections: {},
    };
    expect(() => migrateProfile(broken)).toThrow(ProfileDataError);
  });
});

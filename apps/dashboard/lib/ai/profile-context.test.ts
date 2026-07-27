import {
  createEmptyProfile,
  createItemId,
  createSeedProfile,
  profileSchema,
  type Profile,
  type ProfileInput,
} from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import { MAX_PROFILE_CONTEXT_CHARS } from "./limits";
import { buildProfileContext } from "./profile-context";

/**
 * What the model is allowed to believe about the user. Every case here is a way
 * the assistant could end up asserting something false about someone's career.
 *
 * Fixtures are typed as `ProfileInput` (the schema's *input* side) rather than
 * `Profile`, so a test item may omit the fields Zod defaults — which is how the
 * editor and connectors build items too. Everything still goes through
 * `profileSchema.parse`, so no test can construct a profile the domain would
 * reject.
 */

function profileWith(sections: ProfileInput["sections"]): Profile {
  const empty = createEmptyProfile();
  return profileSchema.parse({
    ...empty,
    basics: { ...empty.basics, name: "Ada Lovelace" },
    sections: { ...empty.sections, ...sections },
  });
}

const experience = (overrides: Record<string, unknown> = {}) => ({
  id: createItemId(),
  company: "Analytical Engines Ltd",
  role: "Principal Engineer",
  startDate: "2023-04",
  summary: "Led the notes-on-the-engine programme.",
  highlights: ["Wrote the first published algorithm."],
  ...overrides,
});

describe("buildProfileContext", () => {
  it("includes real content and the stable item id", () => {
    const item = experience();
    const context = buildProfileContext(profileWith({ experience: [item] }));

    expect(context.json).toContain("Analytical Engines Ltd");
    // Phase 3 addresses items by id; losing it here would make every proposal
    // ambiguous between two entries with the same title.
    expect(context.json).toContain(item.id);
    expect(context.isStarter).toBe(false);
  });

  it("strips provenance and empty fields", () => {
    const context = buildProfileContext(
      profileWith({ experience: [experience()] }),
    );

    // Provenance is unpatchable by the edit helpers, so it is pure cost.
    expect(context.json).not.toContain('"source"');
    expect(context.json).not.toContain("schemaVersion");
    // `location` defaults to "" and was never set — sending it teaches nothing.
    expect(context.json).not.toContain('"location"');
  });

  it("produces valid JSON", () => {
    const context = buildProfileContext(
      profileWith({ experience: [experience()] }),
    );

    expect(() => JSON.parse(context.json)).not.toThrow();
  });

  describe("starter placeholders", () => {
    it("removes the seeded example content and says so", () => {
      // This is the trap: a new profile ships with "Example Company", and a
      // model that reads it as fact will discuss a job the user never had.
      const context = buildProfileContext(createSeedProfile());

      expect(context.json).not.toContain("Example Company");
      expect(context.json).not.toContain("Your most recent role");
      expect(context.isStarter).toBe(true);
      expect(context.notes.join(" ")).toMatch(/placeholder/i);
    });

    it("keeps a placeholder the user has edited", () => {
      // One character of real intent makes it the user's content, not ours.
      const seed = createSeedProfile();
      const edited = profileSchema.parse({
        ...seed,
        sections: {
          ...seed.sections,
          experience: [
            { ...seed.sections.experience[0], company: "Real Company" },
          ],
        },
      });

      const context = buildProfileContext(edited);

      expect(context.json).toContain("Real Company");
      expect(context.isStarter).toBe(false);
    });

    it("is not starter when real content sits alongside placeholders", () => {
      const seed = createSeedProfile();
      const mixed = profileSchema.parse({
        ...seed,
        sections: {
          ...seed.sections,
          experience: [...seed.sections.experience, experience()],
        },
      });

      const context = buildProfileContext(mixed);

      expect(context.isStarter).toBe(false);
      expect(context.json).toContain("Analytical Engines Ltd");
      expect(context.json).not.toContain("Example Company");
    });
  });

  describe("itemCount", () => {
    // It is shown to the user as progress ("3 entries in view") while the model
    // runs, so it has to be the count of what the answer is actually based on —
    // after placeholders are dropped and trimming has run, not before.
    it("counts what the model can see, not what was passed in", () => {
      const context = buildProfileContext(
        profileWith({
          experience: Array.from({ length: 3 }, () => experience()),
        }),
      );

      expect(context.itemCount).toBe(3);
    });

    it("excludes stripped starter placeholders", () => {
      const context = buildProfileContext(createSeedProfile());

      expect(context.itemCount).toBe(0);
      expect(context.isStarter).toBe(true);
    });
  });

  describe("budget", () => {
    it("leaves a realistic profile untouched", () => {
      const context = buildProfileContext(
        profileWith({
          experience: Array.from({ length: 8 }, () => experience()),
        }),
      );

      expect(context.notes).toHaveLength(0);
      expect(context.json.length).toBeLessThan(MAX_PROFILE_CONTEXT_CHARS);
    });

    it("trims whole items and warns the model not to infer absence", () => {
      const huge = Array.from({ length: 100 }, () =>
        experience({ summary: "x".repeat(2_000) }),
      );

      const context = buildProfileContext(profileWith({ experience: huge }));

      expect(context.json.length).toBeLessThanOrEqual(
        MAX_PROFILE_CONTEXT_CHARS,
      );
      // Trimming must never look like a short profile — otherwise the model
      // tells someone with 100 roles that they are light on experience.
      expect(context.notes.join(" ")).toMatch(/omitted/i);
      // Whole items, never a truncated string: a half-cut JSON blob is
      // something the model has to guess at, and it guesses confidently.
      expect(() => JSON.parse(context.json)).not.toThrow();
    });

    it("is deterministic — same profile, same context", () => {
      const profile = profileWith({
        experience: Array.from({ length: 40 }, () =>
          experience({ summary: "y".repeat(1_500) }),
        ),
      });

      expect(buildProfileContext(profile).json).toBe(
        buildProfileContext(profile).json,
      );
    });
  });

  it("reports an entirely empty profile as starter-empty", () => {
    // No placeholders to drop and nothing real either — a user who deleted the
    // seed content. `isStarter` reads as "there is nothing to talk about".
    const context = buildProfileContext(createEmptyProfile());

    expect(context.json).not.toContain("experience");
    expect(context.notes).toHaveLength(0);
  });
});

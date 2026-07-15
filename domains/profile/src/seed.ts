import { createItemId } from "./ids";
import {
  PROFILE_SCHEMA_VERSION,
  profileSchema,
  type Profile,
} from "./schema/profile";

/** A structurally valid, completely empty profile at the current version. */
export function createEmptyProfile(): Profile {
  return profileSchema.parse({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    basics: {},
    sections: {},
  });
}

export interface SeedIdentity {
  name?: string;
  email?: string;
}

/**
 * The first draft a new user opens (docs/architecture/08-dashboard-ux.md:
 * empty states teach — pre-seeded example structure to edit, not a blank
 * void). Example items are obviously placeholders and safe to delete.
 */
export function createSeedProfile(identity: SeedIdentity = {}): Profile {
  const empty = createEmptyProfile();
  return profileSchema.parse({
    ...empty,
    basics: {
      ...empty.basics,
      name: identity.name ?? "",
      headline: "Your headline — the one-liner under your name",
      contacts: { email: identity.email },
    },
    sections: {
      ...empty.sections,
      experience: [
        {
          id: createItemId(),
          source: "manual",
          company: "Example Company",
          role: "Your most recent role",
          startDate: "2024-01",
          summary:
            "Replace this with what you did and why it mattered — one or two sentences.",
          highlights: [
            "A concrete, measurable win (e.g. cut build times by 40%).",
          ],
        },
      ],
      projects: [
        {
          id: createItemId(),
          source: "manual",
          name: "A project you're proud of",
          description:
            "What it is, who it's for, and your part in it. Add a link when you have one.",
          technologies: ["TypeScript"],
        },
      ],
      skills: [
        {
          id: createItemId(),
          source: "manual",
          name: "Core skills",
          skills: ["Add", "your", "skills"],
        },
      ],
    },
  });
}

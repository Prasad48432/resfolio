import { z } from "zod";

import {
  awardItemSchema,
  basicsSchema,
  certificationItemSchema,
  customSectionSchema,
  educationItemSchema,
  experienceItemSchema,
  languageItemSchema,
  projectItemSchema,
  skillGroupSchema,
  writingItemSchema,
} from "./sections";

/**
 * The canonical Profile — defined once, in Zod, here
 * (docs/architecture/01-profile-engine.md). TypeScript types are inferred
 * from it and the database stores exactly what it validates (JSONB, doc 07).
 * Bump `PROFILE_SCHEMA_VERSION` together with a new migration step in
 * `migrate.ts` — never edit v1 semantics in place once real data exists.
 */
export const PROFILE_SCHEMA_VERSION = 1;

/** Canonical section order — also the default render order for views. */
export const SECTION_KEYS = [
  "experience",
  "projects",
  "skills",
  "education",
  "writing",
  "certifications",
  "awards",
  "languages",
  "custom",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const profileSectionsSchema = z.object({
  experience: z.array(experienceItemSchema).max(100).default([]),
  projects: z.array(projectItemSchema).max(100).default([]),
  skills: z.array(skillGroupSchema).max(50).default([]),
  education: z.array(educationItemSchema).max(50).default([]),
  writing: z.array(writingItemSchema).max(100).default([]),
  certifications: z.array(certificationItemSchema).max(50).default([]),
  awards: z.array(awardItemSchema).max(50).default([]),
  languages: z.array(languageItemSchema).max(30).default([]),
  custom: z.array(customSectionSchema).max(20).default([]),
});

export const profileSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  basics: basicsSchema,
  sections: profileSectionsSchema,
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileSections = z.infer<typeof profileSectionsSchema>;

/** Item type per section key (custom sections are themselves the items). */
export type SectionItemMap = {
  [K in SectionKey]: ProfileSections[K][number];
};

/** Section-item schema lookup used by view building and edit helpers. */
export const SECTION_ITEM_SCHEMAS: {
  [K in SectionKey]: z.ZodType<SectionItemMap[K]>;
} = {
  experience: experienceItemSchema,
  projects: projectItemSchema,
  skills: skillGroupSchema,
  education: educationItemSchema,
  writing: writingItemSchema,
  certifications: certificationItemSchema,
  awards: awardItemSchema,
  languages: languageItemSchema,
  custom: customSectionSchema,
};

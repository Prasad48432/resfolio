import { z } from "zod";

import {
  calendarDateSchema,
  httpUrlSchema,
  itemIdSchema,
  itemSourceSchema,
  optionalField,
  inlineRichTextSchema,
  richTextSchema,
  safeLinkUrlSchema,
} from "./primitives";

/**
 * Per-section item schemas — profile schema v1
 * (docs/architecture/01-profile-engine.md). Field lists start from JSON
 * Resume's vocabulary and extend where the portfolio needs more (doc 01
 * open question, closed in Phase 3).
 *
 * Conventions:
 * - Every item carries `id` + `source` provenance (`sourceId` is the
 *   external identifier a connector will upsert by, Phase 6).
 * - Optional *text* fields default to `""` (form-friendly; views treat ""
 *   as absent). Optional *validated* fields (URLs, dates) use
 *   `optionalField` so an empty input means absent, not invalid.
 * - Entries inside `highlights`/`skills` may be empty strings while a draft
 *   is being edited; `buildProfileView` drops empties at read time.
 */
const provenanceFields = {
  id: itemIdSchema,
  source: itemSourceSchema.default("manual"),
  sourceId: z.string().min(1).max(256).optional(),
};

const shortText = (max: number) => z.string().trim().max(max).default("");
const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const profileLinkSchema = z.object({
  id: itemIdSchema,
  label: requiredText(80),
  url: safeLinkUrlSchema,
});

export const basicsSchema = z.object({
  name: shortText(120),
  // Prose only — no bullets. A summary that opens with a list has no sentence
  // in it, and this field is the one every output surface leads with.
  summary: inlineRichTextSchema.default(""),
  location: shortText(120),
  avatarUrl: optionalField(httpUrlSchema),
  contacts: z
    .object({
      email: optionalField(z.email()),
      phone: optionalField(z.string().trim().max(40)),
      website: optionalField(httpUrlSchema),
    })
    .default({}),
  links: z.array(profileLinkSchema).max(20).default([]),
});

export const experienceItemSchema = z.object({
  ...provenanceFields,
  company: requiredText(160),
  role: requiredText(160),
  location: shortText(160),
  url: optionalField(httpUrlSchema),
  startDate: optionalField(calendarDateSchema),
  endDate: optionalField(calendarDateSchema),
  summary: richTextSchema.default(""),
  highlights: z.array(richTextSchema).max(20).default([]),
});

export const educationItemSchema = z.object({
  ...provenanceFields,
  institution: requiredText(160),
  degree: shortText(120),
  area: shortText(160),
  location: shortText(160),
  url: optionalField(httpUrlSchema),
  startDate: optionalField(calendarDateSchema),
  endDate: optionalField(calendarDateSchema),
  score: shortText(60),
  summary: richTextSchema.default(""),
  highlights: z.array(richTextSchema).max(20).default([]),
});

export const projectItemSchema = z.object({
  ...provenanceFields,
  name: requiredText(160),
  description: richTextSchema.default(""),
  url: optionalField(httpUrlSchema),
  repoUrl: optionalField(httpUrlSchema),
  startDate: optionalField(calendarDateSchema),
  endDate: optionalField(calendarDateSchema),
  technologies: z.array(z.string().trim().max(60)).max(50).default([]),
  highlights: z.array(richTextSchema).max(20).default([]),
});

export const skillGroupSchema = z.object({
  ...provenanceFields,
  name: requiredText(80),
  skills: z.array(z.string().trim().max(60)).max(50).default([]),
});

export const writingItemSchema = z.object({
  ...provenanceFields,
  title: requiredText(200),
  publisher: shortText(160),
  url: optionalField(httpUrlSchema),
  date: optionalField(calendarDateSchema),
  summary: richTextSchema.default(""),
});

export const certificationItemSchema = z.object({
  ...provenanceFields,
  name: requiredText(200),
  issuer: shortText(160),
  date: optionalField(calendarDateSchema),
  url: optionalField(httpUrlSchema),
});

export const awardItemSchema = z.object({
  ...provenanceFields,
  title: requiredText(200),
  awarder: shortText(160),
  date: optionalField(calendarDateSchema),
  summary: richTextSchema.default(""),
});

export const languageItemSchema = z.object({
  ...provenanceFields,
  name: requiredText(80),
  fluency: shortText(80),
});

/** Free-form entry inside a user-defined custom section (doc 01: custom
 * sections exist from day one so the schema never blocks anyone). */
export const customItemSchema = z.object({
  ...provenanceFields,
  title: requiredText(200),
  subtitle: shortText(160),
  url: optionalField(httpUrlSchema),
  startDate: optionalField(calendarDateSchema),
  endDate: optionalField(calendarDateSchema),
  summary: richTextSchema.default(""),
  highlights: z.array(richTextSchema).max(20).default([]),
});

export const customSectionSchema = z.object({
  ...provenanceFields,
  title: requiredText(120),
  items: z.array(customItemSchema).max(50).default([]),
});

export type ProfileLink = z.infer<typeof profileLinkSchema>;
export type ProfileBasics = z.infer<typeof basicsSchema>;
export type ExperienceItem = z.infer<typeof experienceItemSchema>;
export type EducationItem = z.infer<typeof educationItemSchema>;
export type ProjectItem = z.infer<typeof projectItemSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type WritingItem = z.infer<typeof writingItemSchema>;
export type CertificationItem = z.infer<typeof certificationItemSchema>;
export type AwardItem = z.infer<typeof awardItemSchema>;
export type LanguageItem = z.infer<typeof languageItemSchema>;
export type CustomItem = z.infer<typeof customItemSchema>;
export type CustomSection = z.infer<typeof customSectionSchema>;

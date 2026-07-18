import { createItemId, type Profile, type SectionKey } from "@resfolio/profile";

import { TEST_IDS } from "./testids";

/**
 * Declarative field config for the profile editor
 * (docs/architecture/08-dashboard-ux.md — schema-driven form). One
 * descriptor list per section drives the generic SectionEditor, so adding
 * or reshaping a section is a data change here, never a new component. The
 * field names match the @resfolio/profile schema exactly; the domain schema
 * remains the source of truth and re-validates at the action boundary.
 */
export type FieldKind =
  | "text"
  | "textarea"
  | "richtext"
  | "date"
  | "url"
  | "email"
  | "tel"
  | "tags"
  | "highlights";

export interface FieldDescriptor {
  /** Key within the item (or `basics`). */
  name: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Full-width in the two-column field grid. */
  wide?: boolean;
  /** Optional stable test id (registry value) for e2e selectors. */
  testId?: string;
}

export interface SectionConfig {
  key: SectionKey;
  /** Singular noun for buttons ("Add experience"). */
  singular: string;
  /** Section heading. */
  title: string;
  /** One-line helper under the heading. */
  hint: string;
  fields: FieldDescriptor[];
  /** The field used as the collapsed-row title. */
  titleField: string;
  /** The field used as the collapsed-row subtitle, if any. */
  subtitleField?: string;
  /** A fresh, schema-valid blank item (required fields get a placeholder
   * value the user overwrites — a blank item would fail validation and
   * block autosave). */
  makeBlank: () => Record<string, unknown>;
}

const provenance = () => ({ id: createItemId(), source: "manual" as const });

export const BASICS_FIELDS: FieldDescriptor[] = [
  {
    name: "name",
    label: "Full name",
    kind: "text",
    placeholder: "Ada Lovelace",
    testId: TEST_IDS.basicsName,
    wide: true,
  },
  {
    name: "headline",
    label: "Headline",
    kind: "text",
    placeholder: "Staff Engineer — distributed systems",
    wide: true,
  },
  {
    name: "summary",
    label: "Summary",
    kind: "richtext",
    placeholder: "A few sentences on who you are and what you do.",
    wide: true,
  },
  {
    name: "location",
    label: "Location",
    kind: "text",
    placeholder: "Berlin, Germany",
  },
  {
    name: "avatarUrl",
    label: "Avatar URL",
    kind: "url",
    placeholder: "https://…",
  },
  {
    name: "contacts.email",
    label: "Email",
    kind: "email",
    placeholder: "you@example.com",
  },
  { name: "contacts.phone", label: "Phone", kind: "tel", placeholder: "+49 …" },
  {
    name: "contacts.website",
    label: "Website",
    kind: "url",
    placeholder: "https://…",
  },
];

export const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: "experience",
    singular: "experience",
    title: "Experience",
    hint: "Roles you've held, most recent first.",
    titleField: "role",
    subtitleField: "company",
    fields: [
      {
        name: "role",
        label: "Role",
        kind: "text",
        placeholder: "Senior Engineer",
      },
      {
        name: "company",
        label: "Company",
        kind: "text",
        placeholder: "Acme Inc.",
      },
      { name: "location", label: "Location", kind: "text" },
      { name: "url", label: "Company URL", kind: "url" },
      {
        name: "startDate",
        label: "Start",
        kind: "date",
        placeholder: "2021-03",
      },
      { name: "endDate", label: "End (blank = present)", kind: "date" },
      { name: "summary", label: "Summary", kind: "richtext", wide: true },
      {
        name: "highlights",
        label: "Highlights",
        kind: "highlights",
        wide: true,
      },
    ],
    makeBlank: () => ({
      ...provenance(),
      role: "New role",
      company: "Company",
    }),
  },
  {
    key: "projects",
    singular: "project",
    title: "Projects",
    hint: "Things you've built or shipped.",
    titleField: "name",
    fields: [
      {
        name: "name",
        label: "Name",
        kind: "text",
        placeholder: "Project name",
      },
      { name: "url", label: "URL", kind: "url" },
      { name: "repoUrl", label: "Repository URL", kind: "url" },
      { name: "startDate", label: "Start", kind: "date" },
      { name: "endDate", label: "End", kind: "date" },
      {
        name: "description",
        label: "Description",
        kind: "richtext",
        wide: true,
      },
      { name: "technologies", label: "Technologies", kind: "tags", wide: true },
      {
        name: "highlights",
        label: "Highlights",
        kind: "highlights",
        wide: true,
      },
    ],
    makeBlank: () => ({ ...provenance(), name: "New project" }),
  },
  {
    key: "skills",
    singular: "skill group",
    title: "Skills",
    hint: "Grouped skills — e.g. Languages, Infrastructure.",
    titleField: "name",
    fields: [
      {
        name: "name",
        label: "Group name",
        kind: "text",
        placeholder: "Languages",
      },
      { name: "skills", label: "Skills", kind: "tags", wide: true },
    ],
    makeBlank: () => ({ ...provenance(), name: "New group", skills: [] }),
  },
  {
    key: "education",
    singular: "education",
    title: "Education",
    hint: "Degrees, schools, and programs.",
    titleField: "institution",
    subtitleField: "degree",
    fields: [
      { name: "institution", label: "Institution", kind: "text" },
      { name: "degree", label: "Degree", kind: "text", placeholder: "BSc" },
      { name: "area", label: "Area of study", kind: "text" },
      { name: "location", label: "Location", kind: "text" },
      { name: "startDate", label: "Start", kind: "date" },
      { name: "endDate", label: "End", kind: "date" },
      { name: "score", label: "Score / GPA", kind: "text" },
      { name: "summary", label: "Summary", kind: "richtext", wide: true },
    ],
    makeBlank: () => ({ ...provenance(), institution: "Institution" }),
  },
  {
    key: "writing",
    singular: "article",
    title: "Writing",
    hint: "Articles, talks, and publications.",
    titleField: "title",
    subtitleField: "publisher",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "publisher", label: "Publisher", kind: "text" },
      { name: "url", label: "URL", kind: "url" },
      { name: "date", label: "Date", kind: "date" },
      { name: "summary", label: "Summary", kind: "richtext", wide: true },
    ],
    makeBlank: () => ({ ...provenance(), title: "New article" }),
  },
  {
    key: "certifications",
    singular: "certification",
    title: "Certifications",
    hint: "Credentials and licenses.",
    titleField: "name",
    subtitleField: "issuer",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "issuer", label: "Issuer", kind: "text" },
      { name: "date", label: "Date", kind: "date" },
      { name: "url", label: "URL", kind: "url" },
    ],
    makeBlank: () => ({ ...provenance(), name: "New certification" }),
  },
  {
    key: "awards",
    singular: "award",
    title: "Awards",
    hint: "Recognition and honors.",
    titleField: "title",
    subtitleField: "awarder",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "awarder", label: "Awarded by", kind: "text" },
      { name: "date", label: "Date", kind: "date" },
      { name: "summary", label: "Summary", kind: "richtext", wide: true },
    ],
    makeBlank: () => ({ ...provenance(), title: "New award" }),
  },
  {
    key: "languages",
    singular: "language",
    title: "Languages",
    hint: "Languages you speak and your fluency.",
    titleField: "name",
    subtitleField: "fluency",
    fields: [
      { name: "name", label: "Language", kind: "text", placeholder: "German" },
      {
        name: "fluency",
        label: "Fluency",
        kind: "text",
        placeholder: "Fluent",
      },
    ],
    makeBlank: () => ({ ...provenance(), name: "New language" }),
  },
];

/** A fresh custom section (title + empty item list). */
export function makeBlankCustomSection(): Record<string, unknown> {
  return { ...provenance(), title: "New section", items: [] };
}

/** A fresh item inside a custom section. */
export function makeBlankCustomItem(): Record<string, unknown> {
  return { ...provenance(), title: "New entry" };
}

export const CUSTOM_ITEM_FIELDS: FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text" },
  { name: "subtitle", label: "Subtitle", kind: "text" },
  { name: "url", label: "URL", kind: "url" },
  { name: "startDate", label: "Start", kind: "date" },
  { name: "endDate", label: "End", kind: "date" },
  { name: "summary", label: "Summary", kind: "richtext", wide: true },
];

/** Read a possibly-nested field (`contacts.email`) off an object. */
export function readField(item: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      item,
    );
  return typeof value === "string" ? value : "";
}

/** The collapsed-row label for an item, falling back to a placeholder. */
export function rowTitle(
  config: SectionConfig,
  item: Record<string, unknown>,
): string {
  return (
    readField(item, config.titleField).trim() || `Untitled ${config.singular}`
  );
}

export type ProfileFormValues = Profile;

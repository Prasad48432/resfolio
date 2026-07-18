import {
  SECTION_KEYS,
  type Profile,
  type SectionKey,
  type ViewDefinition,
} from "@resfolio/profile";

/**
 * The resume configuration layer (docs/architecture/01-profile-engine.md,
 * 02-resume-rendering.md).
 *
 * A resume decides **what to show**, never what the content is: the Profile
 * stays the single source of truth and all editing happens at `/profile`. This
 * module is the pure translation between that intent and the domain's
 * `ViewDefinition` — no React, no I/O — so the rules are unit-testable and the
 * component stays a rendering of them.
 *
 * It writes only what `buildProfileView` already reads (`include`, `order`,
 * `exclude`); there is no new persistence and no new domain concept. That is
 * the whole feature: the engine could always do this, nothing could ask it to.
 */

export interface ResumeSectionDescriptor {
  key: SectionKey;
  label: string;
  /**
   * Always rendered, no toggle offered. Not a schema rule — `include` would
   * happily hide these — but a product one: a resume without your work history
   * is not a resume, and a toggle that nobody should ever use is just a way to
   * break your own document. Name/headline/contact/links/summary are `basics`
   * fields rather than sections, so they are locked simply by having no
   * control at all.
   */
  locked?: true;
}

/**
 * Label + lock lookup for every profile section. **This array's order means
 * nothing** — `orderedSections` decides what the panel shows, from the view.
 * (It used to be presented as the render order and quietly disagreed with it:
 * Education sat second here and rendered fourth.)
 */
export const RESUME_SECTIONS: readonly ResumeSectionDescriptor[] = [
  { key: "experience", label: "Work Experience", locked: true },
  { key: "education", label: "Education", locked: true },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Skills" },
  { key: "writing", label: "Writing" },
  { key: "certifications", label: "Certifications" },
  { key: "awards", label: "Awards" },
  { key: "languages", label: "Languages" },
  { key: "custom", label: "Custom sections" },
];

const DESCRIPTOR_BY_KEY = new Map(
  RESUME_SECTIONS.map((section) => [section.key, section]),
);

/**
 * The sections in the order the resume actually renders them — an exact mirror
 * of `orderedSectionKeys` in `@resfolio/profile`'s `view.ts`, which is what
 * `buildProfileView` runs. The panel must agree with the preview beside it, so
 * this reads the view rather than any fixed list.
 *
 * Same tolerance as the domain: unknown keys are ignored and unlisted sections
 * follow in canonical order, so a stale `sectionOrder` can never drop a
 * section from the panel.
 */
export function orderedSections(
  view: ViewDefinition,
): ResumeSectionDescriptor[] {
  const explicit = (view.sectionOrder ?? []).filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const rest = SECTION_KEYS.filter((key) => !explicit.includes(key));
  return [...explicit, ...rest]
    .map((key) => DESCRIPTOR_BY_KEY.get(key))
    .filter((section): section is ResumeSectionDescriptor => Boolean(section));
}

/**
 * Record the section render order. Locked sections participate: `locked` is
 * about *visibility* (a resume without work history isn't one), never about
 * position — and forbidding it would make "Projects, Experience, Skills"
 * impossible to express, which is the whole point of the feature.
 *
 * Stored as absence when it matches canonical order, so an untouched view stays
 * `{}` — the same minimal-storage rule `patchSection` follows, and what keeps a
 * default view out of the render key.
 */
export function setSectionOrder(
  view: ViewDefinition,
  orderedKeys: SectionKey[],
): ViewDefinition {
  const next: ViewDefinition = { ...view };
  const isCanonical =
    orderedKeys.length === SECTION_KEYS.length &&
    orderedKeys.every((key, index) => key === SECTION_KEYS[index]);
  if (isCanonical) {
    delete next.sectionOrder;
  } else {
    next.sectionOrder = orderedKeys;
  }
  return next;
}

/** The section rows a user may toggle. */
export const OPTIONAL_RESUME_SECTIONS = RESUME_SECTIONS.filter(
  (section) => !section.locked,
);

export interface SectionItemChoice {
  id: string;
  label: string;
  /** Secondary line — company, publisher, issuer. May be empty. */
  detail: string;
}

/**
 * The choosable rows for a section. For `custom` these are the custom
 * *sections* themselves, not their items — that is what `buildProfileView`
 * treats section-level ids as, and getting it wrong would silently select
 * nothing.
 */
export function sectionItemChoices(
  profile: Profile,
  key: SectionKey,
): SectionItemChoice[] {
  switch (key) {
    case "experience":
      return profile.sections.experience.map((item) => ({
        id: item.id,
        label: item.role,
        detail: item.company,
      }));
    case "education":
      return profile.sections.education.map((item) => ({
        id: item.id,
        label: item.institution,
        detail: [item.degree, item.area].filter(Boolean).join(", "),
      }));
    case "projects":
      return profile.sections.projects.map((item) => ({
        id: item.id,
        label: item.name,
        detail: item.technologies.slice(0, 3).join(" · "),
      }));
    case "skills":
      return profile.sections.skills.map((item) => ({
        id: item.id,
        label: item.name,
        detail: item.skills.slice(0, 3).join(" · "),
      }));
    case "writing":
      return profile.sections.writing.map((item) => ({
        id: item.id,
        label: item.title,
        detail: item.publisher,
      }));
    case "certifications":
      return profile.sections.certifications.map((item) => ({
        id: item.id,
        label: item.name,
        detail: item.issuer,
      }));
    case "awards":
      return profile.sections.awards.map((item) => ({
        id: item.id,
        label: item.title,
        detail: item.awarder,
      }));
    case "languages":
      return profile.sections.languages.map((item) => ({
        id: item.id,
        label: item.name,
        detail: item.fluency,
      }));
    case "custom":
      return profile.sections.custom.map((section) => ({
        id: section.id,
        label: section.title,
        detail: `${section.items.length} ${section.items.length === 1 ? "entry" : "entries"}`,
      }));
  }
}

/** Included unless explicitly turned off. `undefined` means "on" — that is why
 * a brand-new resume's `{}` view shows everything, and why nothing needs
 * migrating when this UI ships. */
export function isSectionIncluded(
  view: ViewDefinition,
  key: SectionKey,
): boolean {
  return view.sections?.[key]?.include !== false;
}

/** Item ids in the order the resume will render them: the explicit `order`
 * first, then anything unlisted in profile order (mirrors `selectAndOrder`). */
export function orderedChoices(
  view: ViewDefinition,
  key: SectionKey,
  choices: SectionItemChoice[],
): SectionItemChoice[] {
  const order = view.sections?.[key]?.order;
  if (!order || order.length === 0) {
    return choices;
  }
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  const listed: SectionItemChoice[] = [];
  for (const id of order) {
    const choice = byId.get(id);
    if (choice) {
      listed.push(choice);
      byId.delete(id);
    }
  }
  // Unknown ids are ignored and unlisted items follow — the same tolerance
  // `buildProfileView` has, so a stale view never drops new profile content.
  return [...listed, ...byId.values()];
}

export function isItemShown(
  view: ViewDefinition,
  key: SectionKey,
  itemId: string,
): boolean {
  return !view.sections?.[key]?.exclude?.includes(itemId);
}

export function shownCount(
  view: ViewDefinition,
  key: SectionKey,
  choices: SectionItemChoice[],
): number {
  return choices.filter((choice) => isItemShown(view, key, choice.id)).length;
}

/** Immutably patch one section's definition, pruning empty objects so an
 * untouched view stays `{}` and a reset one returns to it. Keeping the stored
 * value minimal matters: `{}` is the identity view, and a view full of
 * defaults would be indistinguishable noise in the render key. */
function patchSection(
  view: ViewDefinition,
  key: SectionKey,
  patch: Partial<
    NonNullable<NonNullable<ViewDefinition["sections"]>[SectionKey]>
  >,
): ViewDefinition {
  const current = view.sections?.[key] ?? {};
  const merged: Record<string, unknown> = { ...current, ...patch };
  for (const [field, value] of Object.entries(merged)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete merged[field];
    }
  }

  const sections = { ...view.sections };
  if (Object.keys(merged).length === 0) {
    delete sections[key];
  } else {
    sections[key] = merged;
  }

  const next: ViewDefinition = { ...view, sections };
  if (Object.keys(sections).length === 0) {
    delete next.sections;
  }
  return next;
}

export function setSectionIncluded(
  view: ViewDefinition,
  key: SectionKey,
  included: boolean,
): ViewDefinition {
  // `true` is the default, so it is stored as absence rather than as `true`.
  return patchSection(view, key, { include: included ? undefined : false });
}

export function setItemShown(
  view: ViewDefinition,
  key: SectionKey,
  itemId: string,
  shown: boolean,
): ViewDefinition {
  const exclude = view.sections?.[key]?.exclude ?? [];
  const next = shown
    ? exclude.filter((id) => id !== itemId)
    : exclude.includes(itemId)
      ? exclude
      : [...exclude, itemId];
  return patchSection(view, key, { exclude: next });
}

/** Record an explicit render order for a section. */
export function setItemOrder(
  view: ViewDefinition,
  key: SectionKey,
  orderedIds: string[],
): ViewDefinition {
  return patchSection(view, key, { order: orderedIds });
}

/** Drop any per-item selection/order — back to "everything, profile order". */
export function resetSectionItems(
  view: ViewDefinition,
  key: SectionKey,
): ViewDefinition {
  return patchSection(view, key, { exclude: undefined, order: undefined });
}

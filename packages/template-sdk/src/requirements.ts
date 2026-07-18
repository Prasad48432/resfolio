import type { ProfileView } from "@resfolio/profile";

import type {
  MissingRequirement,
  ProfileRequirementKey,
  TemplateRequirements,
} from "./types";

/**
 * The completeness check (docs/architecture/05-template-sdk.md).
 *
 * A template is opinionated about what it needs: a hero with no summary is a
 * blank band, a cover-image layout with no cover is a grey rectangle. Rather
 * than render those badly — or defend against them in every renderer — a
 * template *declares* its requirements and the platform asks the user to fill
 * them in.
 *
 * Two scopes, because the fixes live in different places:
 * - **`config`** — the template's own settings; the user fixes them right there
 *   in the settings form.
 * - **`profile`** — real profile content; the user fixes it at `/profile`. A
 *   template may need content it cannot itself provide, and saying so early is
 *   far kinder than a published site with a hole in it.
 *
 * This is **advisory, not enforcement**: it returns what's missing and lets the
 * caller decide. The dashboard prompts on load and gates Publish; nothing here
 * blocks a render, because a half-filled draft preview is exactly what the user
 * is looking at while they fix it.
 *
 * Pure over `ProfileView` + config, so it runs identically in the dashboard and
 * in tests, and never needs a database.
 */

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  // Note `false` and `0` are deliberately **not** empty: they are answers. A
  // required boolean would be a contradiction anyway — requirements are for
  // fields with something to fill in.
  return false;
}

function isProfileRequirementMet(
  view: ProfileView,
  key: ProfileRequirementKey,
): boolean {
  if (key.startsWith("sections.")) {
    const sectionKey = key.slice("sections.".length);
    // `buildProfileView` drops sections with nothing to render, so presence in
    // the projection *is* the non-empty check.
    return view.sections.some((section) => section.key === sectionKey);
  }
  const field = key.slice("basics.".length);
  const basics = view.basics as unknown as Record<string, unknown>;
  return !isEmptyValue(basics[field]);
}

/**
 * What this template needs that isn't there yet, in declaration order. Empty
 * means ready. Unknown/undeclared requirements simply produce nothing — a
 * template that declares none is always complete, which is the right default.
 */
export function checkTemplateRequirements(
  requirements: TemplateRequirements | undefined,
  input: { config: unknown; view: ProfileView },
): MissingRequirement[] {
  if (!requirements) {
    return [];
  }
  const missing: MissingRequirement[] = [];

  const config = (input.config ?? {}) as Record<string, unknown>;
  for (const key of requirements.config ?? []) {
    if (isEmptyValue(config[key])) {
      missing.push({ scope: "config", key });
    }
  }

  for (const key of requirements.profile ?? []) {
    if (!isProfileRequirementMet(input.view, key)) {
      missing.push({ scope: "profile", key });
    }
  }

  return missing;
}

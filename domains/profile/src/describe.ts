import { SECTION_KEYS, type Profile, type SectionKey } from "./schema/profile";

/**
 * Naming the things in a profile (docs/architecture/01-profile-engine.md).
 *
 * Items are identified by an opaque `id` and displayed by a *field* that varies
 * per section — `role` + `company` for a job, `institution` for a degree,
 * `title` for an award. Which field that is, is schema knowledge, so it lives
 * here rather than being re-derived by every surface that needs to show an item
 * by name. Two already do: the AI proposal review labels the item a change
 * touches, and the job analysis resolves the item ids a match cites (doc 13).
 *
 * Pure and framework-free, like the rest of the root export.
 */

export interface ProfileItemRef {
  id: string;
  section: SectionKey;
  /** What the user calls this item — never an id, never "Untitled" unless the
   * item genuinely has no name yet. */
  label: string;
}

/** The field(s) that name an item, in the order they read. Every section key
 * has an entry, which is what makes the lookup below total. */
const LABEL_FIELDS: Record<SectionKey, readonly string[]> = {
  experience: ["role", "company"],
  projects: ["name"],
  skills: ["name"],
  education: ["institution"],
  writing: ["title"],
  certifications: ["name"],
  awards: ["title"],
  languages: ["name"],
  custom: ["title"],
};

export function profileItemLabel(
  section: SectionKey,
  item: Record<string, unknown>,
): string {
  const parts = LABEL_FIELDS[section]
    .map((field) => item[field])
    .filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
  return parts.length > 0 ? parts.join(" · ") : "Untitled";
}

/**
 * Every citable item in a profile, flattened.
 *
 * **Custom sections contribute their entries, not themselves.** A custom
 * section is a heading the user invented ("Publications"); the entries under it
 * are the facts. Citing the heading as evidence for anything says nothing, so
 * the container is skipped and each entry is prefixed with it — "Publications ·
 * On Cache Invalidation" reads the way the user's own screen does.
 *
 * Skill *groups* are included as themselves, because in this schema a group is
 * the item: its skills are strings without ids, so there is nothing smaller to
 * point at.
 */
export function describeProfileItems(profile: Profile): ProfileItemRef[] {
  const refs: ProfileItemRef[] = [];

  for (const section of SECTION_KEYS) {
    const items = profile.sections[section] as readonly Record<
      string,
      unknown
    >[];

    for (const item of items) {
      if (section === "custom") {
        const heading = profileItemLabel("custom", item);
        const entries = (item["items"] ?? []) as readonly Record<
          string,
          unknown
        >[];
        for (const entry of entries) {
          refs.push({
            id: String(entry["id"]),
            section,
            label: `${heading} · ${profileItemLabel("custom", entry)}`,
          });
        }
        continue;
      }

      refs.push({
        id: String(item["id"]),
        section,
        label: profileItemLabel(section, item),
      });
    }
  }

  return refs;
}

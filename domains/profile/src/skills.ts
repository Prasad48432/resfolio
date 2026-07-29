import { profileItemLabel } from "./describe";
import { ProfileDataError } from "./errors";
import {
  SECTION_ITEM_SCHEMAS,
  SECTION_KEYS,
  type Profile,
} from "./schema/profile";
import type { ProfileItemRef } from "./describe";

/**
 * Listing a skill the profile already demonstrates
 * (docs/architecture/13-ai-layer.md).
 *
 * ## The problem this exists for
 *
 * `proposal.ts` forbids a set-valued field from gaining a member, and that rule
 * is correct and is not being softened here: a model must never be able to write
 * "Kubernetes" into somebody's skills. But it made a second, unintended thing
 * impossible, and that second thing is a real and common gap.
 *
 * A profile routinely *demonstrates* a technology without *listing* it. A project
 * says `technologies: ["Docker", "Postgres"]`; an experience bullet says
 * "containerised the build with Docker"; and the Skills section — which is what a
 * resume prints as a scannable block, and what an ATS keyword-matches against —
 * says neither. The posting asks for Docker, the profile plainly contains Docker,
 * and the resume does not say Docker. Every mechanism in the AI layer refused to
 * fix that, because every mechanism could only tell "add a skill" from "surface a
 * skill" by asking a model to be honest about which it was doing.
 *
 * ## The answer, and why it is not a relaxation
 *
 * **A skill may be added to a group only if it already appears elsewhere in the
 * user's own profile, and this function is what checks that.** The evidence is
 * not advisory copy shown beside a checkbox — {@link addDemonstratedSkills}
 * re-derives it and throws when it is absent, so there is no argument a caller
 * can pass, and no prompt a model can be talked into writing, that adds a term
 * the profile does not already contain.
 *
 * That makes it the same *kind* of guarantee as the rest of the layer: not "the
 * model was asked nicely", but "the shape makes it unrepresentable". The
 * difference from `proposal.ts` is only *who* may propose. A `ProfileChange`
 * comes from a model, so its set-growth rule is absolute. An addition here comes
 * from a **user ticking a box beside their own sentence**, and the domain checks
 * that the sentence is really theirs.
 *
 * ## What it deliberately cannot do
 *
 * - **Invent a group.** A skill lands in a group that exists. Naming a new group
 *   is a structural edit and belongs in the profile editor.
 * - **Add a term that appears only in the Skills section.** {@link
 *   demonstrationHaystack} excludes it, so "already listed" can never count as
 *   "demonstrated" and a term cannot bootstrap itself into a second group.
 * - **Judge whether a person is good at something.** Appearing in their writing
 *   is the whole bar, and it is a deliberately low one — this surfaces what the
 *   user already wrote, and the user is the one ticking the box.
 */

/** Regex-special characters, escaped so `C++` or `.NET` matches literally
 * rather than compiling as a pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a term appears in a body of text, on word boundaries.
 *
 * **The one implementation of "does the profile mention this", and it lives here
 * because a *guard* depends on it.** The dashboard's keyword coverage asks the
 * same question for display; this asks it to decide whether a write is permitted.
 * Two implementations would eventually disagree, and the direction they would
 * disagree in is the dangerous one — a display saying "you already have Docker"
 * over a guard that refuses to list it.
 *
 * Boundaries are conditional because `\b` needs a word character beside it:
 * `\bc\+\+\b` matches nothing, since `+` is not a word character.
 */
export function termAppearsIn(haystack: string, term: string): boolean {
  const needle = term.trim();
  if (needle === "") {
    return false;
  }
  const isWordChar = (character: string) => /\w/.test(character);
  const lead = isWordChar(needle[0] ?? "") ? "\\b" : "";
  const tail = isWordChar(needle[needle.length - 1] ?? "") ? "\\b" : "";
  return new RegExp(`${lead}${escapeRegex(needle)}${tail}`, "i").test(haystack);
}

/**
 * The text a skill must appear in to count as demonstrated: everything the user
 * wrote **except the Skills section itself**.
 *
 * The exclusion is the load-bearing part. Including it would make every listed
 * skill "demonstrated", so a term in one group could be added to another on the
 * strength of its own presence — a guard that vouches for the thing it is meant
 * to check.
 */
export function demonstrationHaystack(profile: Profile): string {
  // Destructured to omit: `skills` is the section being excluded and `rest` is
  // the entire point of the statement. The `_` prefix this used to rely on is
  // not a convention the shared rule is configured for.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { skills, ...rest } = profile.sections;
  return JSON.stringify({ basics: profile.basics, sections: rest });
}

/** Every skill currently listed, in any group, lowercased for comparison. */
function listedSkills(profile: Profile): Set<string> {
  const listed = new Set<string>();
  for (const group of profile.sections.skills) {
    for (const skill of group.skills) {
      listed.add(skill.trim().toLowerCase());
    }
  }
  return listed;
}

export interface SkillGroupRef {
  id: string;
  name: string;
}

/**
 * A term the posting wants, which the profile demonstrates and does not list.
 *
 * `evidence` is what makes it reviewable: the user is shown the entries their own
 * words appear in, so ticking the box is a decision about something they can see
 * rather than a claim they are asked to trust.
 */
export interface DemonstratedSkill {
  /** As the posting spells it — this is what will be listed. */
  skill: string;
  evidence: ProfileItemRef[];
  /** The group this would join by default. Null when the profile has no skill
   * groups at all, in which case there is nowhere to put it and the caller
   * should say so rather than invent one. */
  suggestedGroupId: string | null;
}

/**
 * The terms worth offering: demonstrated somewhere, listed nowhere.
 *
 * Pure and order-preserving — the posting's own order is the order they are
 * shown in, so the list reads against the keyword row above it.
 *
 * **The suggested group is the one that already holds the most terms from the
 * same entry.** If a project lists `["Docker", "Kubernetes", "Terraform"]` and
 * the profile has a group containing Kubernetes and Terraform, Docker belongs
 * there — that is a better guess than "the first group" and it is derived from
 * the user's own grouping rather than from a taxonomy this package would have to
 * invent and maintain. Ties and misses fall back to the first group, and the
 * caller offers a picker regardless: this is a default, not a decision.
 */
export function findDemonstratedSkills(
  profile: Profile,
  terms: readonly string[],
): DemonstratedSkill[] {
  const haystack = demonstrationHaystack(profile);
  const listed = listedSkills(profile);
  const groups = profile.sections.skills;
  const found: DemonstratedSkill[] = [];
  const seen = new Set<string>();

  for (const raw of terms) {
    const skill = raw.trim();
    const key = skill.toLowerCase();

    if (skill === "" || seen.has(key) || listed.has(key)) {
      continue;
    }
    if (!termAppearsIn(haystack, skill)) {
      continue;
    }
    seen.add(key);

    const evidence = evidenceFor(profile, skill);
    found.push({
      skill,
      evidence,
      suggestedGroupId:
        suggestGroup(profile, evidence) ?? groups[0]?.id ?? null,
    });
  }

  return found;
}

/** The entries whose own text mentions the term. Skills groups are never
 * evidence — see {@link demonstrationHaystack}. */
function evidenceFor(profile: Profile, skill: string): ProfileItemRef[] {
  const refs: ProfileItemRef[] = [];

  for (const section of SECTION_KEYS) {
    if (section === "skills") {
      continue;
    }
    const items = profile.sections[section] as readonly Record<
      string,
      unknown
    >[];
    for (const item of items) {
      if (termAppearsIn(JSON.stringify(item), skill)) {
        refs.push({
          id: String(item["id"] ?? ""),
          section,
          label: profileItemLabel(section, item),
        });
      }
    }
  }

  return refs.slice(0, 6);
}

/**
 * The group holding the most sibling terms from the entries this skill came
 * from. Null when nothing overlaps, so the caller falls back rather than getting
 * a confidently wrong answer.
 */
function suggestGroup(
  profile: Profile,
  evidence: readonly ProfileItemRef[],
): string | null {
  const siblings = new Set<string>();
  for (const ref of evidence) {
    const items = profile.sections[
      ref.section as keyof Profile["sections"]
    ] as readonly Record<string, unknown>[];
    const item = items?.find((candidate) => candidate["id"] === ref.id);
    const technologies = item?.["technologies"];
    if (Array.isArray(technologies)) {
      for (const entry of technologies) {
        if (typeof entry === "string") {
          siblings.add(entry.trim().toLowerCase());
        }
      }
    }
  }

  if (siblings.size === 0) {
    return null;
  }

  let best: { id: string; overlap: number } | null = null;
  for (const group of profile.sections.skills) {
    const overlap = group.skills.filter((skill) =>
      siblings.has(skill.trim().toLowerCase()),
    ).length;
    if (overlap > 0 && (best === null || overlap > best.overlap)) {
      best = { id: group.id, overlap };
    }
  }

  return best?.id ?? null;
}

export interface SkillAddition {
  groupId: string;
  skill: string;
}

/**
 * Add demonstrated skills to existing groups.
 *
 * **Re-derives the evidence rather than trusting the caller**, for exactly the
 * reason `applyProfileChanges` re-runs its guard: the list the user ticked was
 * computed against a profile that may have been edited in another tab since, and
 * a client round trip is not a trust boundary. A term with no demonstration in
 * the profile as it stands right now is refused, whatever the caller believed.
 *
 * Additions are applied in order against the *evolving* profile, so a batch can
 * never smuggle in what one addition could not — and each group re-parses through
 * `skillGroupSchema`, so the same length and content rules a typed skill faces
 * apply to one that arrived this way.
 *
 * Duplicates are skipped rather than refused: two ticks that resolve to the same
 * term is a no-op, not an error.
 */
export function addDemonstratedSkills(
  profile: Profile,
  additions: readonly SkillAddition[],
): Profile {
  let working = profile;

  for (const addition of additions) {
    const skill = addition.skill.trim();
    if (skill === "") {
      continue;
    }

    if (!termAppearsIn(demonstrationHaystack(working), skill)) {
      throw new ProfileDataError(
        `Cannot list "${skill}": nothing else in this profile mentions it.`,
      );
    }

    const index = working.sections.skills.findIndex(
      (group) => group.id === addition.groupId,
    );
    if (index === -1) {
      throw new ProfileDataError(`No skill group with id ${addition.groupId}.`);
    }

    const group = working.sections.skills[index]!;
    const already = group.skills.some(
      (entry) => entry.trim().toLowerCase() === skill.toLowerCase(),
    );
    if (already) {
      continue;
    }

    const parsed = SECTION_ITEM_SCHEMAS.skills.safeParse({
      ...group,
      skills: [...group.skills, skill],
    });
    if (!parsed.success) {
      throw new ProfileDataError(
        `Cannot list "${skill}": ${parsed.error.message}`,
      );
    }

    const skills = [...working.sections.skills];
    skills[index] = parsed.data;
    working = { ...working, sections: { ...working.sections, skills } };
  }

  return working;
}

import {
  SECTION_KEYS,
  createSeedProfile,
  type Profile,
  type SectionKey,
} from "@resfolio/profile";

import { MAX_PROFILE_CONTEXT_CHARS } from "./limits";

/**
 * Turning a Profile into model context (docs/architecture/13-ai-layer.md, §13
 * "context management"). Pure — no env, no I/O, no clock — so what the model
 * sees is exactly reproducible and unit-testable.
 *
 * **JSON, not prose, and that is deliberate.** A prose rendering ("Acme ·
 * Senior Engineer · 2024–now") is cheaper in tokens and reads more naturally,
 * but it destroys the two things Phase 3 depends on: the **field names** a
 * proposal must address (`summary`, `highlights`, `company`) and the **stable
 * item ids** it must target. A model shown "Acme · Senior Engineer" has to
 * guess that the field is called `company`, and a guess there produces a
 * proposal the schema rejects. Showing it the actual shape costs some tokens
 * and removes an entire class of invalid output.
 *
 * There is deliberately **no retrieval, no embedding, no chunking**. The
 * Profile is already structured and bounded; retrieval over a document that
 * fits in the context window is infrastructure solving no problem.
 */

/** Keys stripped from every item. `source`/`sourceId` are provenance the model
 * has no use for and could not patch anyway (the edit helpers refuse), and
 * `schemaVersion` is storage bookkeeping. Every character here is paid for on
 * every turn, so anything the model cannot act on does not go in. */
const OMITTED_KEYS = new Set(["source", "sourceId", "schemaVersion"]);

export interface ProfileContext {
  /** The compact JSON the system prompt embeds. */
  json: string;
  /**
   * Sentences appended after the JSON that qualify what it means. They exist
   * because *the absence of something in this JSON is not evidence it is
   * absent from the user's life* — placeholders were dropped, content may have
   * been trimmed — and a model that doesn't know that will confidently tell
   * someone they have no experience.
   */
  notes: string[];
  /** Nothing real in the profile yet — every section item is still an unedited
   * starter placeholder. Callers use this to change what they ask for. */
  isStarter: boolean;
  /**
   * How many real items the model can see, after placeholders were dropped and
   * trimming ran.
   *
   * Exposed because the chat reports it as progress ("14 entries in view") while
   * the model is being called, and a progress label has to be a fact rather than
   * a reassurance. It is deliberately the *post-processing* count — the number of
   * entries the answer will actually be based on, not the number in the database.
   */
  itemCount: number;
}

/** Drop empty strings, empty arrays, undefined, and the omitted keys — deeply.
 * The profile schema defaults optional text to `""`, so an unpruned profile is
 * mostly empty fields; sending them teaches the model nothing and costs on
 * every turn. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (OMITTED_KEYS.has(key)) {
        continue;
      }
      const pruned = prune(raw);
      if (pruned !== undefined) {
        result[key] = pruned;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  if (typeof value === "string") {
    return value.trim() === "" ? undefined : value;
  }
  return value;
}

/**
 * Whether an item is an untouched starter placeholder.
 *
 * A brand-new profile is **seeded with example content** — "Example Company",
 * "Your most recent role", `skills: ["Add", "your", "skills"]` (doc 08: empty
 * states teach). That is excellent for the editor and poisonous for a model:
 * an assistant that reads it as fact will discuss the user's job at Example
 * Company in perfect good faith, which is fabrication arriving through the
 * front door rather than from the model's imagination.
 *
 * Detection compares against a **freshly built seed** rather than a hardcoded
 * list of strings, ignoring the ids (which are generated per profile). That
 * way editing `createSeedProfile` can never silently break this — the check
 * follows the seed automatically, and there is no second copy of the
 * placeholder copy to keep in sync.
 */
function isUntouchedSeedItem(
  key: SectionKey,
  item: { id: string },
  seed: Profile,
): boolean {
  const candidate = fingerprint(item);
  return (seed.sections[key] as readonly { id: string }[]).some(
    (seeded) => fingerprint(seeded) === candidate,
  );
}

/** An item's content with `id` excluded, in a stable key order. Ids are
 * generated per profile, so comparing them would make every seeded item look
 * edited; sorting the keys means two structurally identical items compare equal
 * regardless of the order their fields were written in. */
function fingerprint(item: { id: string }): string {
  const entries = Object.entries(item)
    .filter(([key]) => key !== "id")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** Strip untouched placeholders. Returns the cleaned sections and how many
 * were dropped, so the caller can say so rather than silently shrinking the
 * profile. */
function withoutSeedPlaceholders(profile: Profile): {
  sections: Profile["sections"];
  dropped: number;
} {
  const seed = createSeedProfile();
  const sections = {} as Profile["sections"];
  let dropped = 0;

  for (const key of SECTION_KEYS) {
    const items = profile.sections[key] as readonly { id: string }[];
    const kept = items.filter((item) => {
      const isPlaceholder = isUntouchedSeedItem(key, item, seed);
      if (isPlaceholder) {
        dropped += 1;
      }
      return !isPlaceholder;
    });
    // The cast mirrors `buildProfileView`'s: at runtime each key's items keep
    // their own type, but TypeScript can't correlate a union key with its item
    // type across a filter.
    (sections as Record<string, unknown>)[key] = kept;
  }

  return { sections, dropped };
}

/** Total items across every section — the trimming loop's measure of "largest". */
function sectionItemCounts(
  sections: Profile["sections"],
): { key: SectionKey; count: number }[] {
  return SECTION_KEYS.map((key) => ({ key, count: sections[key].length }));
}

/**
 * Shrink to fit the budget by removing whole items, largest section first.
 *
 * Item-at-a-time rather than string truncation, because cutting a JSON blob
 * mid-object produces something the model has to guess at, and it guesses
 * confidently. Removing whole items keeps every remaining item true and
 * complete — the profile becomes *shorter*, never *wrong* — and the caller
 * tells the model it happened so absence is never read as evidence.
 */
function trimToBudget(sections: Profile["sections"]): {
  sections: Profile["sections"];
  removed: number;
} {
  const working = { ...sections };
  let removed = 0;

  const size = () => JSON.stringify(prune(working) ?? {}).length;

  while (size() > MAX_PROFILE_CONTEXT_CHARS) {
    const largest = sectionItemCounts(working)
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0];
    if (!largest) {
      break;
    }
    // Drop from the end: sections are maintained in the user's own order, and
    // what they put last is what they consider least important.
    (working as Record<string, unknown>)[largest.key] = working[
      largest.key
    ].slice(0, -1);
    removed += 1;
  }

  return { sections: working, removed };
}

/**
 * Build the Profile block for the system prompt.
 *
 * Called per request rather than cached: the user may have edited their profile
 * in another tab between two messages, and answering from a stale copy is a
 * subtle way to be wrong about someone's own career.
 */
export function buildProfileContext(profile: Profile): ProfileContext {
  const { sections: withoutPlaceholders, dropped } =
    withoutSeedPlaceholders(profile);
  const { sections, removed } = trimToBudget(withoutPlaceholders);

  const json = JSON.stringify(
    prune({ basics: profile.basics, sections }) ?? {},
    null,
    // Two-space indent: unindented JSON saves tokens but collapses a career
    // into one line, and every model reads nested structure better with it.
    2,
  );

  const notes: string[] = [];

  const itemCount = SECTION_KEYS.reduce(
    (total, key) => total + sections[key].length,
    0,
  );
  const isStarter = itemCount === 0 && dropped > 0;

  if (dropped > 0) {
    notes.push(
      `${dropped} unedited starter placeholder ${dropped === 1 ? "entry" : "entries"} (the example content Resfolio seeds a new profile with) ${dropped === 1 ? "was" : "were"} removed above. Treat those as empty — they are not real experience. If the user asks what to do next, the answer is to replace them in the profile editor.`,
    );
  }

  if (removed > 0) {
    notes.push(
      `${removed} ${removed === 1 ? "entry was" : "entries were"} omitted to fit the context limit. Do not state that anything is missing from this profile — you are not seeing all of it.`,
    );
  }

  return { json, notes, isStarter, itemCount };
}

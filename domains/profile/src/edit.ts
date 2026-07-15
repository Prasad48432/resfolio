import { ProfileDataError } from "./errors";
import { basicsSchema } from "./schema/sections";
import {
  SECTION_ITEM_SCHEMAS,
  type Profile,
  type SectionItemMap,
  type SectionKey,
} from "./schema/profile";

/**
 * Pure, immutable edit operations (docs/architecture/01-profile-engine.md).
 * The editor's field arrays, future AI deltas, and connector imports all
 * mutate profiles through these — every write is validated on the way in,
 * so an invalid profile can never be *constructed*, only rejected.
 */

export function updateBasics(
  profile: Profile,
  patch: Partial<Profile["basics"]>,
): Profile {
  const parsed = basicsSchema.safeParse({ ...profile.basics, ...patch });
  if (!parsed.success) {
    throw new ProfileDataError(`Invalid basics: ${parsed.error.message}`);
  }
  return { ...profile, basics: parsed.data };
}

function withSection<K extends SectionKey>(
  profile: Profile,
  key: K,
  items: SectionItemMap[K][],
): Profile {
  return {
    ...profile,
    sections: { ...profile.sections, [key]: items },
  };
}

function parseItem<K extends SectionKey>(
  key: K,
  item: unknown,
): SectionItemMap[K] {
  const parsed = SECTION_ITEM_SCHEMAS[key].safeParse(item);
  if (!parsed.success) {
    throw new ProfileDataError(`Invalid ${key} item: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Append (or insert at `index`) a new item. Ids must be unique. */
export function addItem<K extends SectionKey>(
  profile: Profile,
  key: K,
  item: SectionItemMap[K],
  index?: number,
): Profile {
  const parsed = parseItem(key, item);
  const items = profile.sections[key] as SectionItemMap[K][];
  if (items.some((existing) => existing.id === parsed.id)) {
    throw new ProfileDataError(
      `An item with id ${parsed.id} already exists in ${key}.`,
    );
  }
  const at = index === undefined ? items.length : index;
  if (at < 0 || at > items.length) {
    throw new ProfileDataError(`Insert index ${at} is out of range.`);
  }
  return withSection(profile, key, [
    ...items.slice(0, at),
    parsed,
    ...items.slice(at),
  ]);
}

/** Patch an item's fields; `id` and provenance are not patchable. */
export function updateItem<K extends SectionKey>(
  profile: Profile,
  key: K,
  itemId: string,
  patch: Partial<Omit<SectionItemMap[K], "id" | "source" | "sourceId">>,
): Profile {
  const items = profile.sections[key] as SectionItemMap[K][];
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    throw new ProfileDataError(`No ${key} item with id ${itemId}.`);
  }
  const current = items[index] as SectionItemMap[K];
  // Provenance is never patchable — drop those keys before merging.
  const safePatch = { ...(patch as Record<string, unknown>) };
  delete safePatch["id"];
  delete safePatch["source"];
  delete safePatch["sourceId"];
  const parsed = parseItem(key, { ...current, ...safePatch });
  const next = [...items];
  next[index] = parsed;
  return withSection(profile, key, next);
}

export function removeItem(
  profile: Profile,
  key: SectionKey,
  itemId: string,
): Profile {
  const items = profile.sections[key];
  const next = items.filter((item) => item.id !== itemId);
  if (next.length === items.length) {
    throw new ProfileDataError(`No ${key} item with id ${itemId}.`);
  }
  return withSection(profile, key, next as SectionItemMap[typeof key][]);
}

/** Reorder within a section (the drag-reorder primitive). */
export function moveItem(
  profile: Profile,
  key: SectionKey,
  fromIndex: number,
  toIndex: number,
): Profile {
  const items = profile.sections[key];
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length
  ) {
    throw new ProfileDataError(
      `Cannot move ${key} item from ${fromIndex} to ${toIndex} (length ${items.length}).`,
    );
  }
  if (fromIndex === toIndex) {
    return profile;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved as SectionItemMap[typeof key]);
  return withSection(profile, key, next as SectionItemMap[typeof key][]);
}

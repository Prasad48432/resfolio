import { z } from "zod";

import { ProfileDataError } from "./errors";
import {
  basicsSchema,
  customItemSchema,
  type CustomItem,
} from "./schema/sections";
import {
  SECTION_ITEM_SCHEMAS,
  SECTION_KEYS,
  type Profile,
  type SectionItemMap,
  type SectionKey,
} from "./schema/profile";

/**
 * ProfileView (docs/architecture/01-profile-engine.md): the read-only,
 * denormalized projection templates and renderers consume — the *only*
 * contract they depend on. Built by applying a view definition (a
 * Document's selection, ordering, and deltas) to a Profile.
 * `buildProfileView` is pure and deterministic: same inputs, same output,
 * on the server and in the browser (the optimistic-preview trick, doc 08).
 */

const sectionKeySchema = z.enum(SECTION_KEYS);

export const sectionViewDefinitionSchema = z.object({
  /** `false` drops the section entirely. Default: included. */
  include: z.boolean().optional(),
  /** Item ids to render first, in this order; unlisted items follow in
   * profile order. Unknown ids are ignored. For `custom`, ids are the
   * custom-*section* ids. */
  order: z.array(z.string()).optional(),
  /** Item ids to drop (for `custom`: custom-section ids). */
  exclude: z.array(z.string()).optional(),
});

/**
 * The Document side of `Profile × Document` (doc 01). Documents store one
 * of these (Phase 4's `documents.config`); Phase 3 renders the identity
 * view (everything, profile order) by passing no definition.
 */
export const viewDefinitionSchema = z.object({
  /** Sections to render first, in this order; unlisted sections follow in
   * canonical order. */
  sectionOrder: z.array(sectionKeySchema).optional(),
  sections: z
    .partialRecord(sectionKeySchema, sectionViewDefinitionSchema)
    .optional(),
  /** Per-item field overrides keyed by item id — the tailoring deltas.
   * `id`/`source`/`sourceId` are never patchable. Patched items must still
   * satisfy the section schema. */
  deltas: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  /** Field overrides for basics (e.g. a tailored summary). */
  basics: z.record(z.string(), z.unknown()).optional(),
});

export type SectionViewDefinition = z.infer<typeof sectionViewDefinitionSchema>;
export type ViewDefinition = z.infer<typeof viewDefinitionSchema>;

export type StandardSectionKey = Exclude<SectionKey, "custom">;

export type ProfileViewStandardSection = {
  [K in StandardSectionKey]: {
    key: K;
    items: readonly SectionItemMap[K][];
  };
}[StandardSectionKey];

export interface ProfileViewCustomSection {
  key: "custom";
  /** The custom section's own stable id. */
  id: string;
  title: string;
  items: readonly CustomItem[];
}

export type ProfileViewSection =
  | ProfileViewStandardSection
  | ProfileViewCustomSection;

export interface ProfileView {
  basics: Profile["basics"];
  /** Ordered; sections with nothing to render are omitted. */
  sections: readonly ProfileViewSection[];
}

const UNPATCHABLE_KEYS = new Set(["id", "source", "sourceId"]);

function applyDelta<T extends { id: string }>(
  item: T,
  deltas: ViewDefinition["deltas"],
  schema: z.ZodType<T>,
): T {
  const delta = deltas?.[item.id];
  if (!delta) {
    return item;
  }
  const patch = Object.fromEntries(
    Object.entries(delta).filter(([key]) => !UNPATCHABLE_KEYS.has(key)),
  );
  const parsed = schema.safeParse({ ...item, ...patch });
  if (!parsed.success) {
    throw new ProfileDataError(
      `Delta for item ${item.id} produces an invalid item: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Selection + explicit order, then profile order for the rest. */
function selectAndOrder<T extends { id: string }>(
  items: readonly T[],
  definition: SectionViewDefinition | undefined,
): T[] {
  const excluded = new Set(definition?.exclude ?? []);
  const kept = items.filter((item) => !excluded.has(item.id));
  const explicitOrder = definition?.order ?? [];
  if (explicitOrder.length === 0) {
    return kept;
  }
  const byId = new Map(kept.map((item) => [item.id, item]));
  const first = explicitOrder
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
  const listed = new Set(explicitOrder);
  const rest = kept.filter((item) => !listed.has(item.id));
  return [...first, ...rest];
}

const nonEmpty = (value: string) => value.trim() !== "";

/** Draft arrays tolerate empty entries mid-edit; views never show them. */
function tidyCustomItem(item: CustomItem): CustomItem {
  return { ...item, highlights: item.highlights.filter(nonEmpty) };
}

/** Structural cleanup shared by every standard section: drop empty entries
 * from the string-array fields any item might carry. Not key-generic on
 * purpose — TypeScript can't correlate a union key with its item type, and
 * the operation is purely structural anyway. */
function tidyStandardItem<T extends { id: string }>(item: T): T {
  const tidied = { ...item } as Record<string, unknown>;
  for (const field of ["highlights", "skills", "technologies"] as const) {
    const value = tidied[field];
    if (Array.isArray(value)) {
      tidied[field] = (value as string[]).filter(nonEmpty);
    }
  }
  return tidied as T;
}

function orderedSectionKeys(view: ViewDefinition): SectionKey[] {
  const explicit = (view.sectionOrder ?? []).filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const rest = SECTION_KEYS.filter((key) => !explicit.includes(key));
  return [...explicit, ...rest];
}

function buildBasics(
  profile: Profile,
  patch: ViewDefinition["basics"],
): Profile["basics"] {
  if (!patch) {
    return profile.basics;
  }
  const parsed = basicsSchema.safeParse({ ...profile.basics, ...patch });
  if (!parsed.success) {
    throw new ProfileDataError(
      `Basics delta produces invalid basics: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Apply a view definition to a profile. Pure — no clock, no randomness, no
 * I/O — so previews can run it client-side on the draft while the server
 * runs it on published versions, with identical results.
 */
export function buildProfileView(
  profile: Profile,
  view: ViewDefinition = {},
): ProfileView {
  const sections: ProfileViewSection[] = [];

  for (const key of orderedSectionKeys(view)) {
    const definition = view.sections?.[key];
    if (definition?.include === false) {
      continue;
    }

    if (key === "custom") {
      const customSections = selectAndOrder(
        profile.sections.custom,
        definition,
      );
      for (const section of customSections) {
        const patched = applyDelta(
          section,
          view.deltas,
          SECTION_ITEM_SCHEMAS.custom,
        );
        const items = patched.items
          .map((item) =>
            tidyCustomItem(applyDelta(item, view.deltas, customItemSchema)),
          )
          .filter((item) => nonEmpty(item.title));
        if (items.length > 0) {
          sections.push({
            key: "custom",
            id: patched.id,
            title: patched.title,
            items,
          });
        }
      }
      continue;
    }

    // Correlated-union cast: at runtime `SECTION_ITEM_SCHEMAS[key]` parses
    // exactly the items in `profile.sections[key]`, but TypeScript can't
    // prove that pairing across a union key. Narrow both to the common base
    // (`{ id: string }`) for the shared pipeline; the resulting section is
    // structurally a ProfileViewSection.
    const schema = SECTION_ITEM_SCHEMAS[key] as z.ZodType<{ id: string }>;
    const source = profile.sections[key] as readonly { id: string }[];
    const items = selectAndOrder(source, definition)
      .map((item) => applyDelta(item, view.deltas, schema))
      .map(tidyStandardItem);
    if (items.length > 0) {
      sections.push({ key, items } as unknown as ProfileViewSection);
    }
  }

  return { basics: buildBasics(profile, view.basics), sections };
}

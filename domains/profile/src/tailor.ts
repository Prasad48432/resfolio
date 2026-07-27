import { z } from "zod";

import { profileItemLabel, type ProfileItemRef } from "./describe";
import { ProfileDataError } from "./errors";
import {
  MAX_PROPOSED_CHANGES,
  profileChangeSchema,
  reviewProfileChanges,
  type ProfileChange,
  type ProfileChangeReview,
} from "./proposal";
import { itemIdSchema } from "./schema/primitives";
import { SECTION_KEYS, type Profile, type SectionKey } from "./schema/profile";
import { orderedSectionKeys, type ViewDefinition } from "./view";

/**
 * Job tailoring — the plan a model produces for one resume, and the rules that
 * decide what may reach it (docs/architecture/13-ai-layer.md, Phase 5).
 *
 * **Tailoring writes a `ViewDefinition`, never the Profile.** That decision was
 * made in doc 01 and implemented long before there was an AI layer: `deltas` are
 * per-item field overrides keyed by stable id, `basics` is a per-document
 * summary override, and `documents.view` already stores one. So ten applications
 * produce ten view definitions and zero copies of the user's career, and the
 * canonical profile keeps whatever wording the user wrote. Promoting a tailored
 * line to the profile is a *different* action — the Phase 3 proposal flow — and
 * the default is the safe one.
 *
 * **The guard is the same guard, because the destination changes nothing about
 * the risk.** It is tempting to relax here: a delta is scoped to one document,
 * reversible, and never touches the source of truth. But the tailored copy is
 * the one that gets sent to the employer, so a fabricated bullet in a delta is
 * *more* consequential than one in a draft profile, not less. So
 * {@link reviewProfileChanges} is reused verbatim rather than re-implemented
 * with a looser rule set — and it fits without adaptation because a
 * `ProfileChange` already *is* a delta coordinate: item id, field name,
 * replacement value is precisely what `deltas` is keyed by. There is no second
 * change schema in this file for that reason.
 *
 * Three properties worth reading before changing anything here:
 *
 * 1. **The base is always the canonical Profile**, never the already-tailored
 *    view. The rule being enforced is "may not claim what the user did not
 *    write", and the profile is what they wrote. A view-relative base would let
 *    tailoring ratchet: each pass legal against the last, the tenth unrecognis-
 *    able against the first.
 * 2. **Every change in a batch is checked against the same immutable base.**
 *    {@link applyProfileChanges} must re-check against the *evolving* profile
 *    because it mutates it; deltas mutate nothing, so no sequencing hazard
 *    exists and none is invented.
 * 3. **Emphasis may reorder and may never hide.** {@link tailorPlanSchema} has
 *    no `exclude` and no `include`, so "drop the retail job" is not something a
 *    model can express here — the mirror image of the no-add rule, and for the
 *    same reason: a role silently missing from a resume someone then sends is a
 *    lie by omission the platform helped tell. Hiding content stays a deliberate
 *    human act in the resume's own Sections panel.
 *
 * Pure and framework-free, like the rest of the root export: no SDK, no
 * provider, no prompt. Where the plan came from is not this file's business.
 */

const sectionKeySchema = z.enum(SECTION_KEYS);

/**
 * How many item ids one section's ordering may carry. The profile schema permits
 * a hundred items in a section, so this is the same "pathological, not ordinary"
 * ceiling — it exists so a malformed plan is bounded, not to constrain anyone.
 */
const MAX_ORDERED_ITEMS = 100;

const tailorItemOrderSchema = z.object({
  section: sectionKeySchema,
  /** The ids to lead with, most relevant first. Unlisted items keep their
   * position behind these — the same tolerance `buildProfileView` has. */
  itemIds: z.array(itemIdSchema).max(MAX_ORDERED_ITEMS),
});

/**
 * The model's output for one tailoring pass.
 *
 * **Nothing here is `.optional()`, deliberately.** Strict structured output
 * requires every property to be present, so an optional field is a field the
 * provider may reject the whole schema over — and an empty array says "nothing
 * to propose" just as clearly as an absent one. `profileProposalSchema` and the
 * job analysis' schema follow the same rule; this is the third file to need it.
 */
export const tailorPlanSchema = z.object({
  /** Rewrites of prose that already exists, as ordinary `ProfileChange`s. */
  changes: z.array(profileChangeSchema).max(MAX_PROPOSED_CHANGES),
  /** Section render order for this resume — the ids the posting cares about
   * first. Empty means "leave it alone". */
  sectionOrder: z.array(sectionKeySchema).max(SECTION_KEYS.length),
  /** Item order within sections. */
  itemOrder: z.array(tailorItemOrderSchema).max(SECTION_KEYS.length),
});

export type TailorPlan = z.infer<typeof tailorPlanSchema>;

/** One section's proposed order, resolved to items the user recognises — the
 * review has to show names, not ids. */
export interface TailorSectionEmphasis {
  section: SectionKey;
  /** The **full** resulting order, not just the ids the model listed: what it
   * named leads, everything else follows in its current position. Showing the
   * complete list is what makes the review match the resume. */
  items: ProfileItemRef[];
}

/**
 * Reordering, resolved against what this resume renders today. Both fields are
 * empty when the plan's ordering would change nothing — a "reorder" that matches
 * the current order is not a suggestion, and presenting one as though it were is
 * how a review screen loses the user's attention.
 */
export interface TailorEmphasis {
  sectionOrder: SectionKey[];
  sections: TailorSectionEmphasis[];
}

export interface TailorReview {
  /** Guarded rewrites — `valid` is shown, `rejected` is counted. */
  changes: ProfileChangeReview;
  emphasis: TailorEmphasis;
}

/**
 * The wire shape for applying an accepted emphasis.
 *
 * Deliberately **not** {@link TailorEmphasis}: that carries labels, and a label
 * arriving from a browser is text the server would have to either trust or
 * ignore. Ids and section keys are all the apply path needs, and both are
 * re-resolved against the user's own profile at render.
 */
export const tailorEmphasisSchema = z.object({
  sectionOrder: z.array(sectionKeySchema).max(SECTION_KEYS.length),
  sections: z
    .array(
      z.object({
        section: sectionKeySchema,
        itemIds: z.array(itemIdSchema).max(MAX_ORDERED_ITEMS),
      }),
    )
    .max(SECTION_KEYS.length),
});

export type TailorEmphasisInput = z.infer<typeof tailorEmphasisSchema>;

export function hasEmphasis(emphasis: TailorEmphasis): boolean {
  return emphasis.sectionOrder.length > 0 || emphasis.sections.length > 0;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

/**
 * The item ids this resume renders for a section, in the order it renders them —
 * a mirror of `selectAndOrder` in `view.ts`, which is what actually runs.
 *
 * The comparison base has to be *what the resume shows today*, not the profile's
 * own order: a user who already dragged their projects into a deliberate order
 * must not be told the model is "reordering" them when it proposes exactly what
 * they chose.
 */
function renderedItemIds(
  profile: Profile,
  view: ViewDefinition,
  section: SectionKey,
): string[] {
  const definition = view.sections?.[section];
  const excluded = new Set(definition?.exclude ?? []);
  const kept = (profile.sections[section] as readonly { id: string }[])
    .map((item) => item.id)
    .filter((id) => !excluded.has(id));

  const keptSet = new Set(kept);
  const listed: string[] = [];
  for (const id of definition?.order ?? []) {
    if (keptSet.has(id) && !listed.includes(id)) {
      listed.push(id);
    }
  }
  return [...listed, ...kept.filter((id) => !listed.includes(id))];
}

function itemRef(
  profile: Profile,
  section: SectionKey,
  id: string,
): ProfileItemRef {
  const items = profile.sections[section] as readonly Record<string, unknown>[];
  const item = items.find((candidate) => candidate["id"] === id);
  return {
    id,
    section,
    label: item ? profileItemLabel(section, item) : "Untitled",
  };
}

/** Resolve a proposed order: drop ids this resume doesn't render (hallucinated,
 * stale, or hidden by the user), then append everything unlisted so the result
 * is the complete order the resume will use. */
function resolveItemOrder(
  profile: Profile,
  view: ViewDefinition,
  section: SectionKey,
  proposed: readonly string[],
): { ids: string[]; changed: boolean } {
  const rendered = renderedItemIds(profile, view, section);
  const renderedSet = new Set(rendered);

  const listed: string[] = [];
  for (const id of proposed) {
    if (renderedSet.has(id) && !listed.includes(id)) {
      listed.push(id);
    }
  }

  const ids = [...listed, ...rendered.filter((id) => !listed.includes(id))];
  return { ids, changed: !sameOrder(ids, rendered) };
}

/** Complete and dedupe a proposed section order, or `[]` when it changes
 * nothing. An empty proposal returns empty rather than being completed to
 * canonical order — otherwise "the model said nothing" would render as "the
 * model wants your sections back in default order". */
function resolveSectionOrder(
  view: ViewDefinition,
  proposed: readonly SectionKey[],
): SectionKey[] {
  if (proposed.length === 0) {
    return [];
  }
  const listed = proposed.filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const resolved = [
    ...listed,
    ...SECTION_KEYS.filter((key) => !listed.includes(key)),
  ];
  return sameOrder(resolved, orderedSectionKeys(view)) ? [] : resolved;
}

/**
 * Partition a tailoring plan into what may be shown and what must not be.
 *
 * Pure and total. Run on the server that produced the plan, so a rejected
 * rewrite never reaches a screen, and again at the moment of applying — the same
 * two-pass discipline as the proposal flow, for the same reason: a plan
 * validated a minute ago against a profile since edited in another tab is caught
 * rather than written.
 */
export function reviewTailorPlan(
  profile: Profile,
  view: ViewDefinition,
  plan: TailorPlan,
): TailorReview {
  const changes = reviewProfileChanges(profile, plan.changes);

  const sections: TailorSectionEmphasis[] = [];
  const seen = new Set<SectionKey>();

  for (const entry of plan.itemOrder) {
    // A model that lists the same section twice has contradicted itself; the
    // first answer is as good as any and a merge would invent a third order.
    if (seen.has(entry.section)) {
      continue;
    }
    seen.add(entry.section);

    // Reordering a section the user has turned off would silently reorder
    // something invisible, and the review would show a change with no effect.
    if (view.sections?.[entry.section]?.include === false) {
      continue;
    }

    const resolved = resolveItemOrder(
      profile,
      view,
      entry.section,
      entry.itemIds,
    );
    if (resolved.changed) {
      sections.push({
        section: entry.section,
        items: resolved.ids.map((id) => itemRef(profile, entry.section, id)),
      });
    }
  }

  return {
    changes,
    emphasis: {
      sectionOrder: resolveSectionOrder(view, plan.sectionOrder),
      sections,
    },
  };
}

/**
 * Write accepted rewrites into a resume's view as deltas.
 *
 * **Re-runs the guard rather than trusting its caller**, exactly like
 * {@link applyProfileChanges} — and for a reason `buildProfileView` cannot
 * cover. The render path *does* re-parse every delta through the section's own
 * schema, so an invalid value can never render; but a `highlights` array that
 * grew from three entries to four is perfectly valid data, and the growth rules
 * live only in the guard. An apply path that skipped them would be a hole
 * straight through the invariant, on the copy that gets sent to employers.
 *
 * The value written is the review's **normalised** `after`, not the raw
 * proposal: the same string the diff promised, so applying cannot deliver
 * something the user did not read.
 *
 * Throws on any refusal other than `unchanged` (which is a no-op, not an error),
 * because callers partition with {@link reviewTailorPlan} first — a failure here
 * is a race or a bug.
 */
export function applyTailoredChanges(
  profile: Profile,
  view: ViewDefinition,
  changes: readonly ProfileChange[],
): ViewDefinition {
  const review = reviewProfileChanges(profile, changes);
  const blocked = review.rejected.filter(
    (entry) => entry.reason !== "unchanged",
  );
  if (blocked.length > 0) {
    throw new ProfileDataError(
      `Cannot tailor this resume: ${blocked[0]?.detail ?? "invalid change."}`,
    );
  }

  let next: ViewDefinition = { ...view };

  for (const entry of review.valid) {
    if (entry.change.target === "basics") {
      next = {
        ...next,
        basics: { ...next.basics, summary: entry.after },
      };
      continue;
    }

    // Merged per field, not per item: a resume tailored on `summary` and then on
    // `highlights` for the same role keeps both overrides.
    next = {
      ...next,
      deltas: {
        ...next.deltas,
        [entry.change.itemId]: {
          ...next.deltas?.[entry.change.itemId],
          [entry.change.field]: entry.after,
        },
      },
    };
  }

  return next;
}

/**
 * Write an accepted emphasis into a resume's view.
 *
 * Merges into each section's definition rather than replacing it, so the
 * `include`/`exclude` choices the user made in the Sections panel survive a
 * tailoring pass. A canonical section order is stored as *absence*, mirroring
 * `setSectionOrder` in the dashboard: `{}` is the identity view, and a view full
 * of defaults is noise in the render key.
 *
 * No guard, and none is missing: an ordering cannot state anything. The ids are
 * re-resolved at render, where an unknown one is ignored.
 */
export function applyTailoredEmphasis(
  view: ViewDefinition,
  emphasis: TailorEmphasisInput,
): ViewDefinition {
  const next: ViewDefinition = { ...view };

  if (emphasis.sectionOrder.length > 0) {
    const isCanonical =
      emphasis.sectionOrder.length === SECTION_KEYS.length &&
      emphasis.sectionOrder.every((key, index) => key === SECTION_KEYS[index]);
    if (isCanonical) {
      delete next.sectionOrder;
    } else {
      next.sectionOrder = [...emphasis.sectionOrder];
    }
  }

  if (emphasis.sections.length > 0) {
    const sections = { ...next.sections };
    for (const entry of emphasis.sections) {
      sections[entry.section] = {
        ...sections[entry.section],
        order: [...entry.itemIds],
      };
    }
    next.sections = sections;
  }

  return next;
}

/**
 * How many fields this resume overrides — the number that tells a user their
 * resume is already tailored for something.
 *
 * It matters because tailoring is cumulative by construction: a pass for a new
 * posting leaves the previous pass' deltas on every field it doesn't touch, and
 * a resume quietly carrying two jobs' worth of tailoring is not tailored for
 * either. Surfacing the count is what makes {@link clearTailoring} findable.
 */
export function countTailoredFields(view: ViewDefinition): number {
  const basics = Object.keys(view.basics ?? {}).length;
  const items = Object.values(view.deltas ?? {}).reduce(
    (total, delta) => total + Object.keys(delta).length,
    0,
  );
  return basics + items;
}

/**
 * Drop every override, back to the profile's own wording.
 *
 * **Keeps `sectionOrder`, `include` and `exclude`.** Those are the user's own
 * Sections-panel decisions about what this resume shows; only `deltas` and
 * `basics` are tailored *content*, and a reset that also rearranged their
 * document would be a reset of the wrong thing.
 */
export function clearTailoring(view: ViewDefinition): ViewDefinition {
  const next: ViewDefinition = { ...view };
  delete next.deltas;
  delete next.basics;
  return next;
}

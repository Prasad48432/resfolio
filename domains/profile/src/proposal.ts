import { z } from "zod";

import { profileItemLabel } from "./describe";
import { updateBasics, updateItem } from "./edit";
import { ProfileDataError } from "./errors";
import { itemIdSchema } from "./schema/primitives";
import {
  SECTION_ITEM_SCHEMAS,
  type Profile,
  type SectionKey,
} from "./schema/profile";

/**
 * Proposed profile changes — the type an AI proposal is expressed in, and the
 * guard that decides whether one may be shown to a user at all
 * (docs/architecture/13-ai-layer.md).
 *
 * This lives in `@resfolio/profile` rather than in the dashboard, and rather
 * than in a `@resfolio/ai` package, because none of it is model-facing: it
 * validates against the profile's own schemas and applies through the profile's
 * own edit helpers, whose comment already reserved the seat for "future AI
 * deltas". Nothing here imports an SDK, a provider, or a prompt — a proposal is
 * a plain object, and where it came from is not this file's business.
 *
 * **The no-fabrication invariant is held here, structurally.** The prompt asks
 * the model not to invent facts, and that matters — a model fighting its
 * instructions produces rejected output, which is a worse experience than one
 * that cooperates. But the prompt is not the guarantee. Four properties are:
 *
 * 1. **There is no "add" variant.** A `ProfileChange` addresses an *existing*
 *    item by its stable id and replaces one field's value. There is no shape in
 *    which "add Kubernetes to their skills" or "add a role at Acme" can be
 *    expressed, so it is not something anyone downstream has to remember to
 *    reject. (This mirrors `@resfolio/integrations`' rule that a connector may
 *    never propose the user's identity — enforced by an absent field rather
 *    than by a policy, doc 12.)
 * 2. **Only prose is proposable.** {@link PROPOSABLE_ITEM_FIELDS} is an
 *    allowlist of the fields that are *writing*: summaries, descriptions,
 *    highlights. The fields that are *facts* — company, role, institution,
 *    dates, URLs, issuer, awarder, fluency — are absent from it, so a rewrite
 *    can sharpen how a job is described and can never change which job it was.
 * 3. **Set-valued fields may not grow, and list-valued fields may not
 *    lengthen.** Pruning and reordering `skills`/`technologies` is editing;
 *    adding a member is claiming a competence. Rewriting three highlights into
 *    three (or two) is editing; returning five is inventing two achievements.
 * 4. **Every proposed value re-parses through the section's own Zod schema.**
 *    The same `richTextSchema` that rejects raw HTML from a user's keyboard
 *    rejects it from a model. Model output is hostile input and is not
 *    privileged (doc 10).
 *
 * Users are the fifth layer: nothing here writes anything, and the caller
 * applies only what a human explicitly accepted.
 */

/**
 * How a proposable field's value behaves, which is what decides *which* growth
 * rule applies to it. Keyed by field name rather than by section + field
 * because the names do not collide in meaning across sections — `highlights` is
 * a bullet list everywhere it appears.
 */
const FIELD_KINDS = {
  summary: "text",
  description: "text",
  highlights: "prose-list",
  technologies: "set",
  skills: "set",
} as const;

export type ProposableField = keyof typeof FIELD_KINDS;

/** The flat field enum the model chooses from. Whether a given field is valid
 * *for a given section* is a separate check against
 * {@link PROPOSABLE_ITEM_FIELDS} — keeping the wire enum flat keeps the tool's
 * JSON schema small enough that a cheap model fills it in reliably. */
const PROPOSABLE_FIELDS = Object.keys(FIELD_KINDS) as [
  ProposableField,
  ...ProposableField[],
];

/**
 * Sections whose items may be the target of a proposal, and which of their
 * fields may be touched.
 *
 * Read the **omissions** — they are the design:
 * - `certifications` and `languages` appear nowhere. Every field they have is a
 *   fact (name, issuer, date, fluency); there is no prose in them to improve,
 *   and "fluency: conversational → fluent" is a claim, not an edit.
 * - `custom` is out for a structural reason rather than a policy one: its items
 *   are nested inside a custom *section*, so addressing one needs a second
 *   coordinate that this shape does not carry. Adding it is a schema change,
 *   which is the right amount of friction for widening what a model may touch.
 * - Names and titles (`company`, `role`, `name`, `institution`, `title`) are
 *   absent everywhere. They are how the user identifies the item on their own
 *   screen; a proposal that renamed one would be a proposal the review UI could
 *   not honestly label.
 *
 * The `satisfies` is load-bearing in a small way: it makes it a compile error
 * to allowlist a field that has no declared kind above, so a widening can never
 * land with no growth rule attached to it.
 */
export const PROPOSABLE_ITEM_FIELDS = {
  experience: ["summary", "highlights"],
  projects: ["description", "highlights", "technologies"],
  skills: ["skills"],
  education: ["summary", "highlights"],
  writing: ["summary"],
  awards: ["summary"],
} as const satisfies Partial<Record<SectionKey, readonly ProposableField[]>>;

export type ProposableSection = keyof typeof PROPOSABLE_ITEM_FIELDS;

export const PROPOSABLE_SECTIONS = Object.keys(PROPOSABLE_ITEM_FIELDS) as [
  ProposableSection,
  ...ProposableSection[],
];

/**
 * How many changes one proposal may carry. A cost control *and* a usability
 * one: a review screen with thirty diffs on it does not get read, it gets
 * "apply all"-ed, which is exactly the rubber-stamping this design exists to
 * avoid.
 */
export const MAX_PROPOSED_CHANGES = 12;

const reasonSchema = z.string().trim().min(1).max(240);

/**
 * One proposed change.
 *
 * `basics` is its own branch rather than a seventh section because it is not a
 * list — it has no items and therefore no `itemId`, and modelling that as an
 * optional field would make "which shape is this" a runtime question. Only
 * `summary` is proposable there: name, location, contacts and links are
 * identity, and an assistant that edits those is a category of feature this
 * product does not have.
 *
 * **`z.union`, deliberately, and not `z.discriminatedUnion`.** The two are
 * equivalent at the type level and accept exactly the same values here — the
 * `target` literal still discriminates the branches for TypeScript — but they
 * are *not* equivalent once this schema is handed to a provider. This is a
 * model-facing schema (`profileProposalSchema` below, and `tailorPlanSchema`
 * next door), and strict structured output converts it to JSON Schema: Zod emits
 * **`oneOf` for a discriminated union and `anyOf` for a plain one**, and OpenAI's
 * strict `response_format` permits `anyOf` and rejects `oneOf` outright —
 * `"In context=('properties','changes','items'), 'oneOf' is not permitted"`, a
 * 400 before a single token is generated. That is a whole-request failure, not a
 * degraded one, so the feature reads as "the model didn't answer" while the
 * model was never asked.
 *
 * It survived unnoticed for a while because the *chat* sends this same schema as
 * a **tool** input, which is not validated under the strict subset — so the one
 * path that never called `generateObject` kept working and the two that did
 * failed identically. Switching a union here to `discriminatedUnion` for tidiness
 * would break them again; `proposal.test.ts` asserts the emitted JSON Schema
 * carries no `oneOf`, which is the only form of that rule a reader can check.
 */
export const profileChangeSchema = z.union([
  z.object({
    target: z.literal("basics"),
    field: z.literal("summary"),
    value: z.string(),
    reason: reasonSchema,
  }),
  z.object({
    target: z.literal("item"),
    section: z.enum(PROPOSABLE_SECTIONS),
    itemId: itemIdSchema,
    field: z.enum(PROPOSABLE_FIELDS),
    value: z.union([z.string(), z.array(z.string())]),
    reason: reasonSchema,
  }),
]);

export type ProfileChange = z.infer<typeof profileChangeSchema>;

export const profileProposalSchema = z.object({
  changes: z.array(profileChangeSchema).min(1).max(MAX_PROPOSED_CHANGES),
});

export type ProfileProposal = z.infer<typeof profileProposalSchema>;

/**
 * Why a proposed change was refused. These are reported, not thrown: a proposal
 * is a batch, one bad change in it does not invalidate the rest, and the
 * *count* of refusals is worth surfacing — it is the guard being visible rather
 * than silent.
 */
export type ChangeRejectionReason =
  /** No item with that id in that section — a hallucinated or stale target. */
  | "unknown-item"
  /** That field is not proposable for that section (see the allowlist). */
  | "field-not-proposable"
  /** A string where a list belongs, or the reverse. */
  | "wrong-value-type"
  /** Fails the section's own Zod schema (raw HTML, over length, bad link). */
  | "invalid-value"
  /** Grew a set or lengthened a list — the fabrication rule. */
  | "added-content"
  /** Identical to what is already stored; there is nothing to review. */
  | "unchanged";

export interface ReviewedChange {
  change: ProfileChange;
  /** What this change touches, in the user's words — "Senior Engineer · Acme",
   * or "Profile summary" for a `basics` change. */
  label: string;
  /** The stored value today. */
  before: string | string[];
  /** The value after the section schema normalised it — exactly what would be
   * written, so a diff cannot promise something applying does not deliver. */
  after: string | string[];
}

export interface RejectedChange {
  change: ProfileChange;
  reason: ChangeRejectionReason;
  /** One line, for a log or a developer. Never user-facing copy. */
  detail: string;
}

/**
 * The result of running the guard over a proposal. `valid` means *passed the
 * guard*, not *accepted by the user* — those are deliberately different events,
 * and only the second one writes anything.
 */
export interface ProfileChangeReview {
  valid: ReviewedChange[];
  rejected: RejectedChange[];
}

interface Accepted {
  ok: true;
  label: string;
  before: string | string[];
  after: string | string[];
}

interface Rejected {
  ok: false;
  reason: ChangeRejectionReason;
  detail: string;
}

type CheckResult = Accepted | Rejected;

function reject(reason: ChangeRejectionReason, detail: string): Rejected {
  return { ok: false, reason, detail };
}

/** Case-insensitive membership: fixing "javascript" → "JavaScript" is a
 * spelling correction, not a new claim, so casing alone must not read as
 * growth. */
function containsIgnoringCase(
  haystack: readonly string[],
  needle: string,
): boolean {
  const target = needle.trim().toLowerCase();
  return haystack.some((entry) => entry.trim().toLowerCase() === target);
}

function sameValue(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((entry, index) => entry === b[index])
    );
  }
  return a === b;
}

/**
 * The growth rules — the half of the guard the Zod schemas cannot express,
 * because a longer `highlights` array is perfectly valid *data*. It is only
 * invalid relative to what was already there, which is why this takes both.
 */
function checkGrowth(
  field: ProposableField,
  before: string | string[],
  after: string | string[],
): Rejected | null {
  const kind = FIELD_KINDS[field];

  if (kind === "text") {
    return typeof after === "string"
      ? null
      : reject("wrong-value-type", `${field} is text; received a list.`);
  }

  if (!Array.isArray(after)) {
    return reject("wrong-value-type", `${field} is a list; received text.`);
  }
  const current = Array.isArray(before) ? before : [];

  if (kind === "set") {
    // A membership check, not a length check: swapping one skill for another
    // keeps the count identical, and that substitution is exactly what this
    // forbids.
    const added = after.filter(
      (entry) => !containsIgnoringCase(current, entry),
    );
    return added.length === 0
      ? null
      : reject(
          "added-content",
          `${field} would gain entries not already present: ${added.join(", ")}.`,
        );
  }

  // prose-list: the entries are rewritten wholesale, so membership means
  // nothing — but a list that got *longer* is one that gained a claim.
  return after.length <= current.length
    ? null
    : reject(
        "added-content",
        `${field} would grow from ${current.length} to ${after.length} entries.`,
      );
}

/**
 * Run every rule for one change against one profile. The single place the guard
 * is implemented — {@link reviewProfileChanges} partitions with it and
 * {@link applyProfileChanges} re-runs it, so what the user was shown and what
 * gets written are checked by identical code rather than by two rule sets that
 * agree until one of them is edited.
 */
function checkChange(profile: Profile, change: ProfileChange): CheckResult {
  if (change.target === "basics") {
    const before = profile.basics.summary;
    // Re-parsed by asking the edit helper itself, which is what applying calls
    // — the one way this check cannot drift from what storage will do.
    let after: string;
    try {
      after = updateBasics(profile, { summary: change.value }).basics.summary;
    } catch (error) {
      return reject(
        "invalid-value",
        error instanceof Error ? error.message : "Invalid summary.",
      );
    }
    if (sameValue(before, after)) {
      return reject("unchanged", "basics.summary is already this value.");
    }
    return { ok: true, label: "Profile summary", before, after };
  }

  const allowed: readonly ProposableField[] =
    PROPOSABLE_ITEM_FIELDS[change.section];
  if (!allowed.includes(change.field)) {
    return reject(
      "field-not-proposable",
      `${change.section} has no proposable field "${change.field}".`,
    );
  }

  const items = profile.sections[change.section] as readonly Record<
    string,
    unknown
  >[];
  const item = items.find((candidate) => candidate["id"] === change.itemId);
  if (!item) {
    return reject(
      "unknown-item",
      `No ${change.section} item with id ${change.itemId}.`,
    );
  }

  const before = item[change.field] as string | string[];
  const growth = checkGrowth(change.field, before, change.value);
  if (growth) {
    return growth;
  }

  const parsed = SECTION_ITEM_SCHEMAS[change.section].safeParse({
    ...item,
    [change.field]: change.value,
  });
  if (!parsed.success) {
    return reject("invalid-value", parsed.error.message);
  }

  // The *normalised* value, not the raw one: the schema trims, and a diff
  // showing the raw string would promise something applying does not deliver.
  const after = (parsed.data as Record<string, unknown>)[change.field] as
    | string
    | string[];

  if (sameValue(before, after)) {
    return reject("unchanged", `${change.field} is already this value.`);
  }

  return {
    ok: true,
    label: profileItemLabel(change.section, item),
    before,
    after,
  };
}

/**
 * Partition a proposal into what may be shown and what must not be.
 *
 * Pure and total — it never throws and never mutates. Callers run it twice:
 * once on the server that produced the proposal, so a rejected change never
 * reaches a screen; and again at the moment of applying, so a change that was
 * valid ninety seconds ago against a profile the user has since edited in
 * another tab is caught rather than written.
 */
export function reviewProfileChanges(
  profile: Profile,
  changes: readonly ProfileChange[],
): ProfileChangeReview {
  const valid: ReviewedChange[] = [];
  const rejected: RejectedChange[] = [];

  for (const change of changes) {
    const result = checkChange(profile, change);
    if (result.ok) {
      valid.push({
        change,
        label: result.label,
        before: result.before,
        after: result.after,
      });
    } else {
      rejected.push({ change, reason: result.reason, detail: result.detail });
    }
  }

  return { valid, rejected };
}

/**
 * Apply accepted changes, in order, through the ordinary edit helpers.
 *
 * **This re-runs the guard rather than trusting its caller.** The edit helpers
 * validate against the schema, which would happily accept a `skills` array that
 * gained three entries — the growth rules live only here, so an apply path that
 * skipped them would be a hole straight through the invariant. Each change is
 * checked against the profile *as it stands after the previous one*, so a batch
 * cannot smuggle in what a single change could not.
 *
 * Throws on the first change that fails, because by this point a failure is a
 * bug or a race rather than an expected outcome — callers partition with
 * {@link reviewProfileChanges} first and pass only `valid` changes. The one
 * exception is `unchanged`, which is skipped: two accepted changes to the same
 * field make the second a no-op, and a no-op is not an error.
 */
export function applyProfileChanges(
  profile: Profile,
  changes: readonly ProfileChange[],
): Profile {
  let working = profile;

  for (const change of changes) {
    const result = checkChange(working, change);
    if (!result.ok) {
      if (result.reason === "unchanged") {
        continue;
      }
      const where =
        change.target === "basics"
          ? "basics.summary"
          : `${change.section}.${change.field}`;
      throw new ProfileDataError(
        `Cannot apply change to ${where}: ${result.detail}`,
      );
    }

    working =
      change.target === "basics"
        ? updateBasics(working, { summary: change.value })
        : // One dynamic field name over a union of six item types: TypeScript
          // cannot correlate the two. The cast is not unchecked — `updateItem`
          // re-parses the whole item through that section's schema, and
          // `checkChange` did the same a few lines above.
          updateItem(working, change.section, change.itemId, {
            [change.field]: change.value,
          } as never);
  }

  return working;
}

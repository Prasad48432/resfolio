import { z } from "zod";

/**
 * The AI feature catalogue
 * (docs/architecture/14-ai-usage-and-billing.md §4.2).
 *
 * **This enum is the thing that makes "add a feature without a quota"
 * impossible.** {@link PLAN_LIMITS} is a `Record<PlanId, Record<AiFeature, …>>`,
 * so a new member here fails to typecheck until somebody has decided what it
 * costs on every plan.
 */
export const AI_FEATURES = [
  /** One assistant turn. Metered separately from the tools a turn can call —
   * see the note below. */
  "chat",
  /** `analyzeJobMatch`: a posting read against the whole profile. */
  "jobMatch",
  /** Enhance-for-this-job — the propose pass over the profile. */
  "profileEnhance",
  /** A tailoring plan written onto one resume's `ViewDefinition`. */
  "resumeTailor",
  /** One cover-letter draft. */
  "coverLetter",
  /**
   * One resume read into a Profile at onboarding (doc 16).
   *
   * **The only feature here that is not a recurring workflow**, and the only one
   * a brand-new free account reaches before it has any content. Its allowance is
   * therefore small on every plan and does not scale with the tier: a user has
   * one resume, and the two legitimate reasons to run this twice are a wrong file
   * and a bad extraction.
   */
  "resumeIntake",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export const aiFeatureSchema = z.enum(AI_FEATURES);

/**
 * Display names, so the usage screen and the 402 copy cannot disagree about
 * what a feature is called. Deliberately sentence case — this is product copy,
 * not a heading (doc 08).
 */
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  chat: "General chat",
  jobMatch: "Job analysis",
  profileEnhance: "Profile enhancements",
  resumeTailor: "Resume tailoring",
  coverLetter: "Cover letters",
  resumeIntake: "Resume import",
};

/**
 * What one call of each feature is *worth*, in credits, relative to a chat turn.
 *
 * **Written from day one and read by nothing yet** (§4.4). The quota today is a
 * per-feature counter — five job analyses is five job analyses — and this column
 * exists so that a future move to a single weighted credit pool has history to
 * work with. Backfilling it is not really possible: it would mean re-deriving,
 * months later, what each recorded event would have cost under a table that did
 * not exist when it happened.
 *
 * The numbers are **shape of cost, not measured cost**, and they are deliberately
 * coarse. What decides them is how much goes in and how much comes out:
 *
 * - `chat` is the unit — one turn, one profile, a few sentences.
 * - `jobMatch`, `profileEnhance` and `resumeTailor` all send a whole posting *and*
 *   the whole profile and ask for structured output over both.
 * - `coverLetter` sends the same input and writes four paragraphs of prose.
 * - `resumeIntake` is the most expensive call in the product: a whole PDF in
 *   (rasterised, if it is a scan) and a whole profile out.
 *
 * A total `Record`, like {@link PLAN_LIMITS}, so a new feature cannot be added
 * without deciding its weight — which is the only moment anyone will think about
 * it.
 */
export const FEATURE_COST_UNITS: Record<AiFeature, number> = {
  chat: 1,
  jobMatch: 3,
  profileEnhance: 3,
  resumeTailor: 3,
  coverLetter: 2,
  resumeIntake: 5,
};

/**
 * **A chat turn that calls a tool spends twice** — once on `chat`, once on the
 * tool's own feature.
 *
 * It is what actually costs money, and the alternative makes the chat the
 * cheapest route to every expensive feature in the product: `analyzeJobMatch`
 * is reachable from an ordinary message, so a metered chat and an unmetered
 * tool would meter the wrong half.
 *
 * The requirement this places on the UI is that **both decrements are shown**.
 * One message silently costing two credits reads as a bug, and a user who
 * cannot account for their own usage does not trust the number.
 */
export const TOOL_CALLING_SPENDS_BOTH = true;

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

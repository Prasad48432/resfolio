import type { ProfileItemRef } from "@resfolio/profile";
import { z } from "zod";

import { MAX_JD_CHARS } from "./limits";

/**
 * Job analysis (docs/architecture/13-ai-layer.md, Phase 4).
 *
 * Pure — no env, no I/O, no SDK — so everything the user is shown a number for
 * can be unit-tested without a model. That matters more here than anywhere else
 * in the feature, because this screen's whole output is a claim about how well
 * someone fits a job, and a claim like that has to be defensible when they ask
 * why.
 *
 * **The division of labour is the design: the model classifies, this file
 * counts.** A percentage produced by a language model is a fabricated statistic
 * wearing the costume of a calculation — not reproducible across two runs of
 * the same JD, not explainable, and not defensible. So the model says
 * `strong | partial | gap` per requirement and cites the profile items behind
 * it; the arithmetic, the evidence check and the keyword coverage all happen
 * here, deterministically.
 *
 * This stays in the app rather than moving to a domain package (doc 13:
 * "everything model-facing stays in the app until a second app needs it"). It
 * borrows exactly one thing from `@resfolio/profile` — `ProfileItemRef`, which
 * is how an item is named — because that is schema knowledge, not model
 * knowledge.
 */

/** No `basics`, no free-text citation: evidence is a **profile item id**, so a
 * claimed match is either checkable against the user's own content or it is not
 * a match. This is the analysis-side counterpart of the proposal guard's rule
 * that a change must name an existing item. */
const requirementSchema = z.object({
  /** The requirement in the job description's own terms, not paraphrased into
   * the profile's vocabulary — paraphrasing is how a gap turns into a match. */
  text: z.string().trim().min(1).max(300),
  /**
   * Cited **before** the verdict, and the field order here is what makes that
   * true. Structured output is generated in schema order, so the model has to
   * find its support before it is allowed to state a level — which is both a
   * better way to reason and the reason the UI never has to show a level that
   * has not been checked yet.
   */
  evidence: z.array(z.string().trim().min(1).max(64)).max(6),
  level: z.enum(["strong", "partial", "gap"]),
  /** One line of justification, shown under the requirement. */
  note: z.string().trim().min(1).max(240),
});

export const jobAnalysisSchema = z.object({
  /** The role as the posting states it. Shown as the analysis' title so the
   * user can tell two pasted JDs apart. */
  role: z.string().trim().max(160),
  requirements: z.array(requirementSchema).min(1).max(20),
  /**
   * Terms the posting leans on. **The model extracts them; it does not say
   * whether the profile has them** — that is a string search, and a string
   * search is not something to pay a model to approximate.
   */
  keywords: z.array(z.string().trim().min(1).max(60)).max(30),
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
export type RawRequirement = z.infer<typeof requirementSchema>;

export type MatchLevel = RawRequirement["level"];

export interface VerifiedRequirement {
  text: string;
  level: MatchLevel;
  note: string;
  /** Only the citations that resolved to a real item in this profile. */
  evidence: ProfileItemRef[];
  /** The model claimed a match and none of its citations existed. The claim was
   * demoted to `gap`; this flag is what lets the UI say so. */
  downgraded: boolean;
}

export interface KeywordCoverage {
  keyword: string;
  present: boolean;
}

export interface MatchSummary {
  /** 0–100, rounded. Absent when there is nothing to score. */
  score: number;
  strong: number;
  partial: number;
  gap: number;
  total: number;
}

/**
 * Resolve a requirement's citations and demote unsupported matches.
 *
 * **A `strong` or `partial` with no surviving evidence becomes a `gap`.** A
 * model that has decided someone is a good fit will cite an id it half
 * remembers, and an unverifiable match is exactly the fabrication this
 * architecture exists to catch — it just arrives as a score instead of as a
 * sentence. Demoting rather than dropping keeps the requirement on screen,
 * because "the JD wants Kubernetes and your profile doesn't mention it" is the
 * single most useful line this feature produces.
 */
export function verifyRequirement(
  requirement: RawRequirement,
  index: ReadonlyMap<string, ProfileItemRef>,
): VerifiedRequirement {
  const evidence = requirement.evidence
    .map((id) => index.get(id))
    .filter((ref): ref is ProfileItemRef => ref !== undefined);

  const unsupported = requirement.level !== "gap" && evidence.length === 0;

  return {
    text: requirement.text,
    level: unsupported ? "gap" : requirement.level,
    note: requirement.note,
    evidence,
    downgraded: unsupported,
  };
}

/**
 * The score, and the counts it was computed from.
 *
 * `strong = 1, partial = 0.5, gap = 0`. Trivial arithmetic, deliberately — the
 * point is not the formula, it is that the formula exists somewhere a person
 * can read it and that the UI can show its working. A user who asks "why 74%?"
 * gets "11 strong, 3 partial, 5 gaps out of 19", not a shrug.
 */
export function summarizeMatch(
  requirements: readonly VerifiedRequirement[],
): MatchSummary {
  const strong = requirements.filter((item) => item.level === "strong").length;
  const partial = requirements.filter(
    (item) => item.level === "partial",
  ).length;
  const gap = requirements.filter((item) => item.level === "gap").length;
  const total = requirements.length;

  return {
    score:
      total === 0 ? 0 : Math.round(((strong + partial * 0.5) / total) * 100),
    strong,
    partial,
    gap,
    total,
  };
}

/** Regex-special characters, escaped so a keyword like `C++` or `.NET` is
 * matched literally rather than compiled as a pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a keyword appears in the profile.
 *
 * Word-boundary matching, not `includes`, and the difference is not academic:
 * plain substring matching reports that a profile containing "Google" has "Go",
 * and a wrongly-covered keyword is worse than a missing one — it tells someone
 * their resume already says something it doesn't.
 *
 * The trailing boundary is conditional because `\b` needs a word character
 * beside it: `\bc\+\+\b` never matches anything, since `+` is not a word
 * character and there is no boundary after it. Leading is the same for a
 * keyword like `.NET`.
 */
export function isKeywordPresent(haystack: string, keyword: string): boolean {
  const term = keyword.trim();
  if (term === "") {
    return false;
  }

  const isWordChar = (character: string) => /\w/.test(character);
  const lead = isWordChar(term[0] ?? "") ? "\\b" : "";
  const tail = isWordChar(term[term.length - 1] ?? "") ? "\\b" : "";

  return new RegExp(`${lead}${escapeRegex(term)}${tail}`, "i").test(haystack);
}

export function coverKeywords(
  keywords: readonly string[],
  haystack: string,
): KeywordCoverage[] {
  const seen = new Set<string>();
  const coverage: KeywordCoverage[] = [];

  for (const keyword of keywords) {
    const key = keyword.trim().toLowerCase();
    // Models repeat themselves across a long list; showing "React" twice reads
    // as a bug in the analysis rather than a quirk of the extraction.
    if (key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    coverage.push({
      keyword: keyword.trim(),
      present: isKeywordPresent(haystack, keyword),
    });
  }

  return coverage;
}

/** Id → item, for `verifyRequirement`. Built once per analysis rather than per
 * requirement, and from the same refs the UI shows, so a resolved citation is
 * guaranteed to be renderable. */
export function indexProfileItems(
  refs: readonly ProfileItemRef[],
): Map<string, ProfileItemRef> {
  return new Map(refs.map((ref) => [ref.id, ref]));
}

/**
 * The `POST /api/ai/job` request boundary.
 *
 * Separate from the shape check for the same reason `chat-request.ts` keeps
 * them apart: an oversized job description is perfectly well-formed, and the
 * size limit is a cost control rather than a validation nicety. Rejected, never
 * truncated — half a job description produces a confident analysis of a job
 * nobody advertised.
 */
export const jobRequestSchema = z.object({
  jobDescription: z.string().trim().min(1).max(MAX_JD_CHARS),
});

export type JobRequestProblem =
  | { kind: "invalid"; message: string }
  | { kind: "too-large"; message: string };

export type JobRequestResult =
  | { ok: true; jobDescription: string }
  | { ok: false; problem: JobRequestProblem };

export function parseJobRequest(body: unknown): JobRequestResult {
  const raw = (body as { jobDescription?: unknown } | null)?.jobDescription;
  if (typeof raw === "string" && raw.trim().length > MAX_JD_CHARS) {
    return {
      ok: false,
      problem: {
        kind: "too-large",
        message: `That job description is too long — keep it under ${MAX_JD_CHARS.toLocaleString()} characters.`,
      },
    };
  }

  const parsed = jobRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      problem: { kind: "invalid", message: "Paste a job description first." },
    };
  }

  return { ok: true, jobDescription: parsed.data.jobDescription };
}

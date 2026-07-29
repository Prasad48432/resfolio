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

/**
 * How many requirements one analysis may carry.
 *
 * **Lowered from twenty, and it is a latency control as much as a display one.**
 * Structured output is generated in one uninterrupted run before anything is
 * shown, so every extra requirement is output tokens the user waits through
 * behind a blank panel — twenty of them is roughly a thousand tokens of pure
 * waiting. It is also more than anyone reads: a posting's real asks fit in a
 * dozen, and a list long enough to scroll turns a judgement into a wall.
 */
export const MAX_REQUIREMENTS = 12;

/**
 * One term the posting leans on — and, when the posting offered a choice, the
 * options it accepts.
 *
 * **This shape exists because "Build features using Angular/React and
 * Java/Node.js" was being read as four separate requirements, two of which were
 * then reported missing from a profile that fully satisfies the posting.** A
 * candidate who knows React and Node.js meets that sentence completely; telling
 * them they lack Angular and Java is worse than unhelpful, because the whole
 * value of this screen is that its claims are checkable.
 *
 * **The split is the model's judgement, not a regex, and that is the load-bearing
 * decision.** Splitting on `/` in code gets "Angular/React" right and "CI/CD",
 * "TCP/IP", "UI/UX" and "I/O" wrong — those are single terms that happen to
 * contain a slash, and no stoplist of them is ever finished. Deciding whether a
 * slash means "or" is a reading-comprehension question, which is the one thing
 * the model in this pipeline is actually better at than the code around it. So it
 * reports the structure and this file does the arithmetic, exactly as it does for
 * levels and the score.
 *
 * `anyOf` is **empty for an atomic term** rather than optional: strict structured
 * output requires every property present (the rule `tailor.ts` documents), and an
 * empty list says "no alternatives" as clearly as an absent field.
 */
const keywordSchema = z.object({
  /** As the posting spells it, alternation and all: `Angular/React`, `CI/CD`. */
  term: z.string().trim().min(1).max(60),
  /** The options, when `term` offers a choice. `["Angular", "React"]` for
   * `Angular/React`; empty for `CI/CD`, which is one thing. */
  anyOf: z.array(z.string().trim().min(1).max(60)).max(6),
});

export type RawKeyword = z.infer<typeof keywordSchema>;

export const jobAnalysisSchema = z.object({
  /** The role as the posting states it. Shown as the analysis' title so the
   * user can tell two pasted JDs apart. */
  role: z.string().trim().max(160),
  requirements: z.array(requirementSchema).min(1).max(MAX_REQUIREMENTS),
  /**
   * Terms the posting leans on. **The model extracts them and says which are
   * alternatives; it does not say whether the profile has them** — that is a
   * string search, and a string search is not something to pay a model to
   * approximate.
   */
  keywords: z.array(keywordSchema).max(30),
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
export type RawRequirement = z.infer<typeof requirementSchema>;

/**
 * The chat tool's input — the analysis, plus the three facts that make it a
 * **job** rather than a judgement (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **The job description is deliberately not a field here.** The posting is
 * already in the conversation — the user pasted it — and asking the model to
 * echo four thousand characters back as tool arguments would bill for the same
 * text twice and add seconds of generation before the first requirement appears.
 * `execute` closes over the posting the request already has, the same way it
 * closes over the profile (`createAiTools`).
 *
 * `jobUrl` is here because the user pastes it in the same breath as the posting
 * and it is the one field the tracker cannot derive later. It is read off the
 * message, never fetched: nothing in this product opens a URL a model produced.
 */
export const jobMatchInputSchema = z.object({
  role: z.string().trim().max(160),
  /** As the posting spells it. Absent rather than guessed — a posting that
   * hides its company behind "a fast-growing startup" has no company. */
  company: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
  /** The posting's own link, if the user gave one in their message. Validated
   * and scheme-checked by `@resfolio/job`'s `normalizeJobUrl` before it is
   * stored or rendered — this is a model-produced string that becomes a link
   * somebody clicks. */
  jobUrl: z.string().trim().max(2_000).optional(),
  requirements: z.array(requirementSchema).min(1).max(MAX_REQUIREMENTS),
  keywords: z.array(keywordSchema).max(30),
});

export type JobMatchInput = z.infer<typeof jobMatchInputSchema>;

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
  /** As the posting spells it — `Angular/React`, not one of its halves. */
  keyword: string;
  present: boolean;
  /** The options this term accepts, when it offered a choice. Empty for an
   * atomic term. Rendered so "Angular/React ✓" can say *which* half satisfied
   * it, which is the difference between a claim and a checkable claim. */
  alternatives: string[];
  /** Which alternative the profile actually has, when `present` and the term
   * offered a choice. Null for an atomic term or a genuine gap. */
  matched: string | null;
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

/**
 * Coverage, with **alternatives satisfied by any one option**.
 *
 * A posting that says "Angular/React" is asking for one of them. Reporting the
 * unmatched half as missing turns a fully-satisfied requirement into a warning,
 * and a warning list with false entries in it is one nobody reads — the same
 * reasoning the cover-letter scanner is built on.
 *
 * The `anyOf` list comes from the model (see {@link keywordSchema}); this only
 * decides whether *any* of them is in the profile, and records which, so the
 * screen can say "React ✓" under "Angular/React" rather than a bare tick.
 */
export function coverKeywords(
  keywords: readonly RawKeyword[],
  haystack: string,
): KeywordCoverage[] {
  const seen = new Set<string>();
  const coverage: KeywordCoverage[] = [];

  for (const keyword of keywords) {
    const term = keyword.term.trim();
    const key = term.toLowerCase();
    // Models repeat themselves across a long list; showing "React" twice reads
    // as a bug in the analysis rather than a quirk of the extraction.
    if (key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const alternatives = keyword.anyOf
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

    // An atomic term is its own single candidate, so there is one code path
    // rather than a branch that can disagree with itself.
    const candidates = alternatives.length > 0 ? alternatives : [term];
    const matched =
      candidates.find((candidate) => isKeywordPresent(haystack, candidate)) ??
      null;

    coverage.push({
      keyword: term,
      present: matched !== null,
      alternatives,
      // Null when the term was atomic: "React ✓ satisfies React" is noise.
      matched: alternatives.length > 0 ? matched : null,
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
 * A finished, verified job match — what the tool returns and the card renders.
 *
 * **Everything on it has been checked**: every `evidence` entry resolved to a
 * real profile item, every unsupported match was demoted, every keyword was
 * matched against the exact text the model was shown, and the score is the
 * arithmetic over those levels rather than a number a model wrote. The only
 * unchecked fields are the three the posting itself asserts (`role`, `company`,
 * `location`), which are quotes rather than claims about the user.
 */
export interface JobMatchReview {
  /**
   * Minted here, server-side, and stable for the life of the tool result.
   *
   * It is the id of the row this match will be saved as, and it lands in the
   * transcript with the rest of the tool output — so reopening the conversation
   * a week later finds the same job rather than creating a second one. Generated
   * rather than accepted from the model for the obvious reason: an id is not
   * something a model should be able to choose.
   */
  jobId: string;
  role: string;
  company: string | null;
  location: string | null;
  jobUrl: string | null;
  requirements: VerifiedRequirement[];
  keywords: KeywordCoverage[];
  summary: MatchSummary;
  /** Echoed back so the card and the panel can save and re-match without
   * hunting through the transcript for the message it came from. */
  jobDescription: string;
}

/**
 * The stock phrases a model reaches for instead of leaving a field out.
 *
 * **Observed, not imagined.** Asked to read the company and location off a
 * posting that named neither, `gpt-5-mini` answered `location: "Not specified"` —
 * a perfectly well-formed string that would be stored as a location, rendered
 * under the job title in the panel, and read as a place called "Not specified".
 *
 * An optional field is the one place a model cannot express absence by writing
 * less, because writing nothing looks to it like failing to answer. So absence is
 * recovered here rather than requested in the prompt: a prompt asking for silence
 * is a prompt that will be disobeyed occasionally, and occasionally is enough.
 *
 * **Kept tight and about absence only.** "Remote" is a real location and
 * "Confidential" is a real company; neither belongs on this list. Everything here
 * is a way of saying "there isn't one".
 */
const ABSENCE_PHRASES = new Set([
  "n/a",
  "na",
  "none",
  "not specified",
  "unspecified",
  "not stated",
  "not mentioned",
  "not provided",
  "not listed",
  "not given",
  "unknown",
  "unlisted",
  "-",
  "—",
]);

/** An optional fact from the posting, or null when the model said there wasn't
 * one — in any of the several ways it says that. */
export function optionalFact(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  return ABSENCE_PHRASES.has(trimmed.toLowerCase().replace(/\.$/, ""))
    ? null
    : trimmed;
}

/**
 * Verify a proposed match against the profile the request loaded.
 *
 * Pure, and the division of labour is the one this file exists for: the model
 * said what each requirement is and which items support it; everything numeric
 * happens here.
 */
export function buildJobMatchReview(
  input: JobMatchInput,
  context: {
    jobId: string;
    jobDescription: string;
    /** Resolved profile items, by id — the same refs the UI renders, so a
     * resolved citation is guaranteed to be displayable. */
    index: ReadonlyMap<string, ProfileItemRef>;
    /** Exactly what the model was shown, so coverage can never report a
     * placeholder that was stripped before the model saw it. */
    haystack: string;
  },
): JobMatchReview {
  const requirements = input.requirements.map((requirement) =>
    verifyRequirement(requirement, context.index),
  );

  return {
    jobId: context.jobId,
    role: input.role,
    company: optionalFact(input.company),
    location: optionalFact(input.location),
    // Normalisation (and the `javascript:` refusal behind it) lives in
    // `@resfolio/job`, so the value stored and the value rendered are cleaned by
    // one function rather than two that can disagree.
    jobUrl: optionalFact(input.jobUrl),
    requirements,
    keywords: coverKeywords(input.keywords, context.haystack),
    summary: summarizeMatch(requirements),
    jobDescription: context.jobDescription,
  };
}

/**
 * The posting a turn is about, found in the conversation rather than re-sent.
 *
 * **This is what lets the tool cost twenty tokens instead of four thousand.** The
 * user pasted the posting; it is already in the transcript, and the only question
 * is which message it was.
 *
 * The rule is "the most recent user message long enough to be a posting", and the
 * length floor is doing real work: the turn that asks for a *re-match* after an
 * enhancement says something like "recalculate", and taking the literal last
 * message would match the profile against the word "recalculate" and report a
 * page of gaps. Walking back finds the posting that conversation has been about
 * all along.
 */
export const MIN_JOB_DESCRIPTION_CHARS = 200;

export function findJobDescription(
  messages: readonly { role: string; parts: readonly { type: string }[] }[],
): string | null {
  const texts: string[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const text = message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (text !== "") {
      texts.push(text);
    }
  }

  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index] ?? "";
    if (text.length >= MIN_JOB_DESCRIPTION_CHARS) {
      return text.slice(0, MAX_JD_CHARS);
    }
  }

  // Nothing long enough to be a posting. Returning the last message anyway would
  // produce a confident analysis of a job nobody advertised, which is the
  // failure this whole file is built to avoid — so the tool has nothing to work
  // with and says so.
  return null;
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

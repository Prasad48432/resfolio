/**
 * Every ceiling the AI layer enforces, in one file
 * (docs/architecture/13-ai-layer.md).
 *
 * These are **cost and safety controls, not validation niceties**. An AI
 * endpoint bills per token in both directions, so an unbounded request body is
 * an unbounded invoice — and unlike the rest of the product, the expensive path
 * is the one that succeeds. Collected here rather than inlined so the numbers
 * can be read, compared and changed together, and so the request validator and
 * the model call cannot disagree about them.
 *
 * Pure constants: no env reads, no imports. Unit-testable, and importable from
 * the client if a form ever wants to enforce the same maximum before sending.
 */

/** Turns kept in one request. Context is *built*, never accumulated (doc 13):
 * beyond this the oldest turns are dropped rather than paid for again on every
 * message. Generous enough that a real editing conversation fits. */
export const MAX_MESSAGES = 30;

/** One message. A profile instruction is a sentence or two; this leaves room
 * for someone pasting a paragraph without leaving room for a novel. */
export const MAX_CHARS_PER_MESSAGE = 8_000;

/** The whole conversation. The binding limit in practice — `MAX_MESSAGES`
 * alone would still allow 30 × 8k. */
export const MAX_TOTAL_CHARS = 40_000;

/** Output ceiling passed to the model. The failure mode this prevents is not a
 * wrong answer but a runaway one: a model that starts repeating bills for every
 * token it repeats.
 *
 * **Nothing that runs against a reasoning model may use this number** — see
 * {@link MAX_CHAT_OUTPUT_TOKENS} and {@link MAX_OBJECT_OUTPUT_TOKENS}. It is kept
 * as the default for any future call whose output is genuinely a sentence.
 */
export const MAX_OUTPUT_TOKENS = 2_000;

/**
 * Nothing uses {@link MAX_OUTPUT_TOKENS} today, and that is the finding rather
 * than an oversight worth tidying away.
 *
 * Every call this feature makes runs against a reasoning model, and every one of
 * them needed its own, larger ceiling. The constant is kept as the documented
 * default for a call whose output is genuinely a sentence — and as the reason the
 * two below exist, which is the part that would be lost by deleting it.
 */

/**
 * The ceiling for the two `streamObject` routes (job analysis, cover letter),
 * and the reason it is not {@link MAX_OUTPUT_TOKENS}.
 *
 * **This is the same bug that produced empty chat turns, in its worst form.**
 * Reasoning tokens are spent from `maxOutputTokens` before a single character of
 * the object is emitted, and structured output has no partial credit: a
 * generation that stops against the ceiling mid-JSON produces a document that
 * fails validation, so `useObject` ends with `object` undefined. On screen that
 * is not a short answer — it is "Reading the posting against your profile…"
 * followed by nothing, for a call that was billed in full.
 *
 * Judging fifteen requirements against a whole profile, or composing four
 * paragraphs of letter, is exactly the kind of work a reasoning model spends
 * thousands of tokens on before it writes. Two thousand did not cover the
 * thinking, let alone the object.
 */
export const MAX_OBJECT_OUTPUT_TOKENS = 8_000;

/**
 * The chat's own output ceiling, and the reason it is four times the default.
 *
 * **Reasoning tokens count against `maxOutputTokens`.** The default model is a
 * reasoning model, so a turn that has to work something out spends budget before
 * it emits a single visible character — and when the budget runs out the
 * generation stops with `finishReason: "length"`, which for a turn that was about
 * to call a tool means **an assistant message containing nothing at all**. That is
 * not a truncated answer the user can work with; it is a turn that looks like the
 * feature crashed.
 *
 * It is the compound requests that hit it: "which parts of my profile are
 * weakest" answers from the profile and streams as it goes, but the follow-up
 * ("fix 1, 2, 5 and 7") has to re-read a list, decide which items map to which
 * fields, and then emit complete replacement prose for each as structured tool
 * input. Two thousand tokens does not cover that, and the failure is silent.
 *
 * Still a real ceiling — a runaway is still capped — just one set above the work
 * the feature actually asks for rather than below it.
 */
export const MAX_CHAT_OUTPUT_TOKENS = 8_000;

/**
 * The serialized Profile in the system prompt. Paid on **every turn**, unlike
 * the conversation, so it is the single largest recurring cost in a long chat.
 *
 * The profile schema's own caps (100 experience items, 4,000 chars per rich
 * text field) permit something far larger than any real career, so this exists
 * for the pathological profile rather than the ordinary one — a realistic
 * profile serializes to a few thousand characters and never approaches it.
 * Trimming is visible to the model when it happens (`profile-context.ts`), so a
 * truncated profile can never be mistaken for a short one.
 */
export const MAX_PROFILE_CONTEXT_CHARS = 24_000;

/**
 * A pasted job description (Phase 4). Defined now, with the other ceilings,
 * because a JD is the largest untrusted text this product will ever accept and
 * the limit belongs beside the ones it will be compared against — not invented
 * later in whichever file happens to need it first.
 */
export const MAX_JD_CHARS = 20_000;

/** Requests per user per window, and the window. A conversation is a handful of
 * messages; this stops a stuck client (or someone holding down send) from
 * turning into a bill, while never being reachable by ordinary use. */
export const RATE_LIMIT_REQUESTS = 20;
export const RATE_LIMIT_WINDOW = "10 m" as const;

/**
 * The job-analysis budget, deliberately a fraction of the chat one.
 *
 * One analysis sends a whole job description *and* the whole profile, and asks
 * for a structured object over both — several chat turns' worth of tokens for a
 * single click. Sharing a budget would mean either a chat limit low enough to
 * interrupt a conversation or an analysis limit high enough to be expensive, so
 * the two are counted separately (`rate-limit.ts` keys per mode).
 *
 * Six in ten minutes is far more than anyone applying for a job needs and far
 * less than a loop costs.
 */
export const JOB_RATE_LIMIT_REQUESTS = 6;

/**
 * The tailoring budget (Phase 5). Same shape of cost as an analysis — the whole
 * profile plus a posting — so the same number, counted separately because the two
 * are separate clicks and a user who analysed a posting has not spent their
 * ability to tailor for it.
 */
export const TAILOR_RATE_LIMIT_REQUESTS = 6;

/**
 * The cover-letter budget (Phase 6), and the tightest of the four.
 *
 * A letter is the one output people iterate on — reroll, read, reroll — because
 * prose either sounds like them or it doesn't, and unlike a match score there is
 * no objective answer to settle on. Four is enough to find a draft worth editing
 * and low enough that "reroll until it's perfect" becomes "edit it yourself",
 * which is the better outcome anyway.
 */
export const LETTER_RATE_LIMIT_REQUESTS = 4;

/**
 * The output ceiling for a tailoring pass, which is the one workflow that
 * legitimately needs more than {@link MAX_OUTPUT_TOKENS}.
 *
 * A tailoring plan carries up to twelve complete replacement values — a rewritten
 * summary, a rewritten bullet list — plus the ordering, where the chat's ceiling
 * buys a few sentences. Truncated structured output is worse than a small answer:
 * the object fails to parse and the whole call is billed for nothing.
 *
 * Raised to match {@link MAX_OBJECT_OUTPUT_TOKENS} for the same reason it exists:
 * the reasoning a rewrite requires is spent from this budget before the plan is
 * written, so a ceiling sized for the plan alone is a ceiling the plan never
 * reaches.
 */
export const MAX_TAILOR_OUTPUT_TOKENS = 8_000;

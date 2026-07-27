import type { ProfileItemRef } from "@resfolio/profile";
import { z } from "zod";

import { isKeywordPresent } from "./job-analysis";

/**
 * Cover letters (docs/architecture/13-ai-layer.md, Phase 6).
 *
 * **This is the workflow that defeats every mechanism the earlier phases relied
 * on, and the file exists to answer that.** Phases 3–5 hold the no-fabrication
 * invariant structurally: a proposal has no "add" variant, only allowlisted prose
 * fields are writable, a list may not lengthen, every value re-parses through the
 * profile's own Zod schema. None of that is available here. A cover letter *is*
 * new prose by definition — it exists nowhere in the Profile, addresses no field,
 * and cannot be validated against a schema that describes the user's career.
 * "Don't fabricate" is exactly the kind of instruction this architecture refuses
 * to treat as a guarantee, and yet a letter is the highest-stakes text the product
 * produces: it is sent, unedited, to a stranger who is deciding.
 *
 * Three structural answers, in ascending order of how much they buy:
 *
 * 1. **The envelope is not the model's to write.** There is no `greeting` and no
 *    `signoff` field. Resfolio composes both, from the recipient the user typed
 *    and the name in their own profile. A model cannot invent "Dear Ms. Chen" if
 *    there is nowhere to put it, and cannot misspell a name it was never asked
 *    for — the same "delete the field, delete the failure" move as
 *    `ProfileChange` having no add variant.
 * 2. **Body paragraphs cite profile items, evidence before text.** The paragraph
 *    that makes a claim about someone's experience has to name the entries it
 *    rests on, and a paragraph whose citations resolve to nothing is surfaced as
 *    ungrounded. This is Phase 4's rule applied to prose rather than to a verdict.
 *    Field order is load-bearing for the same reason it is there: generation
 *    follows schema order, so the model finds its support before it writes the
 *    sentence.
 * 3. **The letter's vocabulary is checked, deterministically.** Every number and
 *    every proper noun in the letter must appear in the **profile or the
 *    posting**; anything in neither was invented, and is flagged.
 *    {@link findUnsupportedTerms} is that check.
 *
 * The third is the one that matters, and the insight is that **the posting belongs
 * in the haystack.** A letter must be free to say "the Senior Engineer role at
 * Acme" — that vocabulary is legitimately absent from the user's career and
 * present in the job description they are answering. Union the two and the rule
 * becomes precise and checkable: *a cover letter may only use names and numbers
 * drawn from the user's own history or from the posting it answers.* That catches
 * the whole class this product exists to prevent — invented employers,
 * technologies, degrees, metrics and team sizes — with no model in the loop.
 *
 * What it does **not** catch: a false sentence assembled entirely from true words
 * ("I led the billing migration" when they worked on billing). Nothing short of
 * the user reading it catches that, which is why the letter is presented as a
 * draft to read rather than a file to send, and why nothing here is persisted.
 *
 * Pure — no env, no I/O, no SDK. It borrows one function from `job-analysis.ts`
 * (`isKeywordPresent`), because "does this term appear in the profile" is one
 * question and must not have two answers.
 */

/**
 * The recipient field's ceiling.
 *
 * It lives here rather than in `limits.ts` because it is not a cost control —
 * **the recipient never reaches the server.** The platform composes the greeting
 * in the browser, so the name the user types is not sent to the model, not logged,
 * and not part of any request. That is worth one constant in the right file.
 */
export const MAX_RECIPIENT_CHARS = 120;

const bodyParagraphSchema = z.object({
  /**
   * Ids of the profile items this paragraph's claims rest on.
   *
   * **Before `text`, deliberately.** Structured output is generated in schema
   * order, so the model has to choose its evidence before it writes the sentence
   * that spends it — which is both better reasoning and what makes an ungrounded
   * paragraph detectable rather than merely suspected. Alphabetising these two
   * fields would silently undo it; the test suite guards the order.
   */
  evidence: z.array(z.string().trim().min(1).max(64)).max(6),
  text: z.string().trim().min(1).max(1_200),
});

/**
 * One cover letter.
 *
 * **No `greeting`, no `signoff`, and no `body` blob** — see the header. Nothing
 * is `.optional()`, for the reason `tailor.ts` documents: strict structured output
 * requires every property present.
 */
export const coverLetterSchema = z.object({
  /** The role and employer as the *posting* states them. Shown as the draft's
   * title, and — like everything else the model writes here — checkable against
   * the posting it came from. */
  role: z.string().trim().max(160),
  company: z.string().trim().max(160),
  /** Why this role, this company. The one paragraph that legitimately cites
   * nothing from the profile, which is why it is its own field rather than the
   * first element of `body`. */
  opening: z.string().trim().min(1).max(800),
  /** The claims. Each cites the entries behind it. */
  body: z.array(bodyParagraphSchema).min(1).max(4),
  /** The ask. Also uncited by nature. */
  closing: z.string().trim().min(1).max(600),
});

export type CoverLetter = z.infer<typeof coverLetterSchema>;
export type CoverLetterBodyParagraph = z.infer<typeof bodyParagraphSchema>;

/** The subset a partially-streamed letter can be narrowed to for verification —
 * everything the checks actually read. */
export interface CoverLetterDraft {
  opening: string;
  body: CoverLetterBodyParagraph[];
  closing: string;
}

export interface VerifiedParagraph {
  text: string;
  /** Only the citations that resolved to a real item in this profile. */
  evidence: ProfileItemRef[];
  /** Claims experience and points at nothing. Not removed — a letter with a hole
   * in the middle is worse than one with a warning beside it. */
  ungrounded: boolean;
}

/** A term the letter uses that appears in neither the profile nor the posting. */
export interface UnsupportedTerm {
  term: string;
  /** Numbers are called out separately because they are the fabrication users
   * are least likely to notice and employers most likely to probe. */
  kind: "number" | "name";
}

export interface CoverLetterReview {
  opening: string;
  body: VerifiedParagraph[];
  closing: string;
  unsupported: UnsupportedTerm[];
  /** How many body paragraphs cite nothing that exists. */
  ungroundedCount: number;
}

/**
 * Words that start with a capital for grammatical reasons rather than because
 * they name anything.
 *
 * **This list is closed and must stay tiny.** A stoplist is the wrong tool for
 * "is this a proper noun" — English capitalises every sentence opener, so a list
 * big enough to cover that is a list that silently swallows real fabrications.
 * The detector uses sentence position for that instead (see
 * {@link findUnsupportedTerms}), leaving only the genuinely closed set: the first
 * person, which is capitalised mid-sentence in a way no other English word is.
 */
const ALWAYS_CAPITALISED = new Set(["i", "i'm", "i've", "i'd", "i'll"]);

/** Trailing/leading punctuation and possessives, so `Kubernetes,` and
 * `Acme's` are tested as the words they are. */
function stripPunctuation(token: string): string {
  return token
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}%+#]+$/u, "")
    .replace(/['’]s$/u, "");
}

/** The numeric core of a digit-bearing token: `40%` → `40`, `1,200` → `1,200`. */
function numericCore(token: string): string | null {
  const match = /\d[\d,.]*/.exec(token);
  return match ? match[0].replace(/[.,]$/, "") : null;
}

/**
 * Whether a term is accounted for by the profile or the posting.
 *
 * Three tolerances, each there to stop a *false* flag — the failure mode that
 * matters most, because a warning list with noise in it is a warning list nobody
 * reads:
 *
 * - **Plurals.** A profile saying "API" supports a letter saying "APIs".
 * - **The numeric core.** A letter saying "40%" is supported by a profile saying
 *   "40". The alternative flags every reasonable restatement of a real figure.
 * - **Case**, via `isKeywordPresent`, which is also where the word-boundary rule
 *   lives — the one that stops a profile containing "Google" from vouching for a
 *   letter that says "Go".
 */
function isTermSupported(term: string, haystack: string): boolean {
  if (isKeywordPresent(haystack, term)) {
    return true;
  }

  const core = numericCore(term);
  if (core !== null && core !== term && isKeywordPresent(haystack, core)) {
    return true;
  }

  return (
    term.length > 3 &&
    /s$/i.test(term) &&
    isKeywordPresent(haystack, term.slice(0, -1))
  );
}

/**
 * Every number and proper noun the text uses that appears nowhere in the
 * haystack.
 *
 * **Position, not a dictionary.** A capitalised word mid-sentence is a name; the
 * same word opening a sentence is ambiguous, and no stoplist resolves that
 * without either leaking fabrications or drowning the user in false positives. So
 * a sentence-initial capital is only flagged when something *else* marks it —
 * a digit, or an internal capital (`TypeScript`, `PostgreSQL`, `AWS`, `iOS`),
 * both of which mean "name" regardless of where the word sits.
 *
 * The deliberate gap: a fabricated single-word employer opening a sentence
 * ("Google's approach to X interests me") is missed. Accepted, because the fix is
 * an English dictionary and the miss is narrow — the model was also *told* the
 * rule, and a letter that opens a sentence with an invented company is a letter
 * whose next clause almost always repeats the name mid-sentence.
 */
export function findUnsupportedTerms(
  text: string,
  haystack: string,
): UnsupportedTerm[] {
  const found: UnsupportedTerm[] = [];
  const seen = new Set<string>();

  // Sentence-initial for the first token, and after anything that ends a
  // sentence. `e.g.` marks the following word as initial, which costs one missed
  // name and never produces a false flag.
  let sentenceInitial = true;

  for (const raw of text.split(/\s+/)) {
    const token = stripPunctuation(raw);
    const endsSentence = /[.!?][")'’]?$/.test(raw);

    if (token === "") {
      sentenceInitial = sentenceInitial || endsSentence;
      continue;
    }

    const hasDigit = /\d/.test(token);
    // Any capital past the first character: catches camel and all-caps names
    // wherever they sit in a sentence.
    const hasInnerCapital = /[A-Z]/.test(token.slice(1));
    const isCapitalised = /^\p{Lu}/u.test(token);

    const isName =
      hasInnerCapital || (isCapitalised && !sentenceInitial && !hasDigit);
    const key = token.toLowerCase();

    if (
      (hasDigit || isName) &&
      !ALWAYS_CAPITALISED.has(key) &&
      !seen.has(key) &&
      !isTermSupported(token, haystack)
    ) {
      seen.add(key);
      found.push({ term: token, kind: hasDigit ? "number" : "name" });
    }

    sentenceInitial = endsSentence;
  }

  return found;
}

/**
 * Resolve a letter's citations and scan its prose.
 *
 * **The greeting and signoff are not verified because they are not generated** —
 * Resfolio composes them. Everything the model wrote is checked, which is the
 * property that matters, and it is true by construction rather than by remembering
 * to include a field here.
 */
export function verifyCoverLetter(
  letter: CoverLetterDraft,
  index: ReadonlyMap<string, ProfileItemRef>,
  haystack: string,
): CoverLetterReview {
  const body = letter.body.map((paragraph) => {
    const evidence = paragraph.evidence
      .map((id) => index.get(id))
      .filter((ref): ref is ProfileItemRef => ref !== undefined);
    return {
      text: paragraph.text,
      evidence,
      ungrounded: evidence.length === 0,
    };
  });

  // Scanned as one string rather than per paragraph, so a term used twice is
  // reported once and the dedupe does not depend on where it fell.
  const prose = [letter.opening, ...body.map((p) => p.text), letter.closing]
    .filter((part) => part.trim() !== "")
    .join("\n\n");

  return {
    opening: letter.opening,
    body,
    closing: letter.closing,
    unsupported: findUnsupportedTerms(prose, haystack),
    ungroundedCount: body.filter((paragraph) => paragraph.ungrounded).length,
  };
}

/**
 * The greeting, composed by the platform.
 *
 * "Dear Hiring Manager" is the honest default: it is what you write when you do
 * not know, and inventing a name to avoid it is the failure this replaces.
 */
export function coverLetterGreeting(recipient: string): string {
  const name = recipient.trim();
  return name === "" ? "Dear Hiring Manager," : `Dear ${name},`;
}

export function coverLetterSignoff(signature: string): string {
  const name = signature.trim();
  return name === "" ? "Sincerely," : `Sincerely,\n${name}`;
}

/**
 * The letter as plain text — what gets copied and downloaded.
 *
 * Plain text, not Markdown or HTML: this is pasted into an application form's
 * textarea or the body of an email, and every character of markup would have to
 * be deleted by hand. Empty parts are dropped so a partially-streamed letter
 * assembles without blank gaps.
 */
export function assembleCoverLetter(parts: {
  greeting: string;
  opening: string;
  body: readonly string[];
  closing: string;
  signoff: string;
}): string {
  return [
    parts.greeting,
    parts.opening,
    ...parts.body,
    parts.closing,
    parts.signoff,
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join("\n\n");
}

/** A filename for the download. Not a slug helper — this is the only place that
 * needs one, and a resume's export route builds its own. */
export function coverLetterFilename(company: string, role: string): string {
  const stem = [company, role]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" - ");
  const safe = (stem === "" ? "cover letter" : stem)
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safe || "cover letter"}.txt`;
}

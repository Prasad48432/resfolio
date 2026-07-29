/**
 * The vocabulary the "we are working" lines cycle through.
 *
 * ## Why a bank rather than a sentence
 *
 * Every wait in this feature used to be one fixed line — "Sending…", "Reading
 * the posting against your profile…" — held on screen for the ten to thirty
 * seconds a reasoning model takes. A sentence that does not move for half a
 * minute reads as a sentence that is *stuck*, which is the exact impression the
 * shimmer and the matrix spinner exist to prevent; and the longer ones are read
 * once and then occupy a line of the transcript saying nothing new.
 *
 * So the line rotates through short present participles instead.
 *
 * ## The rule that keeps this honest
 *
 * Doc 13's "no fake progress" is not relaxed here, and the shape of this module
 * is what enforces it: **a bank's words are all descriptions of the same,
 * genuinely-running work — they are synonyms, not stages.** Rotating within a
 * bank claims nothing new; only the server changing phase changes the bank.
 *
 * Which means the one thing never to do is add a word to a bank that names work
 * from a different phase ("Scoring…" in `reading`, "Drafting…" in `matching`).
 * That would turn a rotation into an invented pipeline — a progress bar with no
 * progress behind it, which is what this codebase refused in Phase 2 and had to
 * earn back by reordering the stream.
 *
 * Keep them **short — three words, tested** — and in the present participle: they
 * sit beside a 4×4 spinner in a narrow artefact panel, and the first word is
 * also what a screen reader is given — once — as the stable announcement.
 */

/** The kinds of work the product waits on. One bank each. */
export const WORK_KINDS = [
  "sending",
  "reading",
  "thinking",
  "matching",
  "enhancing",
  "tailoring",
  "letter",
] as const;

export type WorkKind = (typeof WORK_KINDS)[number];

/**
 * The words, in rotation order.
 *
 * **Index 0 is the truest one, not just the first.** It is what renders on the
 * very first frame, what a reduced-motion reader sees for the whole wait, and
 * what assistive technology is told — so it carries the object ("your profile",
 * "the posting") while the rest may be bare verbs.
 */
export const STATUS_WORDS: Record<WorkKind, readonly [string, ...string[]]> = {
  // The moment between the click and the first byte back. Short-lived by
  // definition, so two words is the whole bank.
  sending: ["Sending", "Getting started"],

  // The server has said it is loading the profile. Everything here is that one
  // read described differently.
  reading: ["Reading your profile", "Taking stock", "Gathering context"],

  // The model is reasoning and reasoning is not rendered (doc 13), which is why
  // this bank is the longest — it covers the longest silence in the product.
  thinking: [
    "Thinking",
    "Weighing it up",
    "Joining the dots",
    "Working it through",
    "Considering",
  ],

  // `analyzeJobMatch` is streaming its input: the model is writing out
  // requirement after requirement and checking each against the profile.
  matching: [
    "Reading the posting",
    "Lining it up",
    "Checking requirements",
    "Weighing the evidence",
    "Scoring the fit",
  ],

  // Optimising is one model call and two destinations, and they get two banks
  // rather than one plus a detail clause — the destination is the *whole*
  // difference between them (a permanent career record versus overrides on one
  // document), so it belongs in the first word rather than appended to it.
  enhancing: ["Rewriting your profile", "Sharpening", "Trimming", "Rephrasing"],
  tailoring: [
    "Rewriting your resume",
    "Sharpening",
    "Trimming",
    "Cutting to fit",
  ],

  // Free prose. "Reading it back" is not decoration — the letter really is
  // checked against the profile and the posting before it is shown.
  letter: [
    "Drafting your letter",
    "Finding the opening",
    "Choosing the words",
    "Reading it back",
  ],
};

/** How long each word holds, in ms. Long enough to be read without effort,
 * short enough that the line is never the still thing on a moving screen. It is
 * deliberately *not* the shimmer's 2s period — locked together they beat, and
 * the word would swap on the same frame the highlight crosses it. */
export const STATUS_WORD_INTERVAL_MS = 2400;

/**
 * The word for a given kind at a given tick.
 *
 * Sequential and wrapping — never random. The order is written down and read in
 * review, and a shuffle would also make the component's output depend on when it
 * happened to mount, which is exactly the sort of thing that turns a test into a
 * flake. A negative tick is treated as 0 rather than throwing: this is a status
 * label, and there is no failure here worth a blank line.
 */
export function statusWordAt(kind: WorkKind, tick: number): string {
  const bank = STATUS_WORDS[kind];
  if (!Number.isFinite(tick) || tick <= 0) return bank[0];
  return bank[Math.floor(tick) % bank.length] ?? bank[0];
}

/** The one line assistive technology is given for a kind — announced once,
 * where the visible word is announced never. See `WorkingText`. */
export function statusAnnouncement(kind: WorkKind): string {
  return STATUS_WORDS[kind][0];
}

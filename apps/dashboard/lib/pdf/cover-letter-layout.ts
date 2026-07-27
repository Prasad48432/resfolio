/**
 * The cover letter's page layout — pure geometry, no PDF library
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **Split from the drawing so it can be tested without embedding a font.**
 * Everything that can be wrong about a generated letter and not noticed is in
 * here: a paragraph that overflows the page, a word longer than the measure that
 * loops forever, a letter whose last line lands under the footer. Those are all
 * arithmetic, and arithmetic gets tests.
 *
 * Units are PDF points (72 per inch) throughout, because that is what pdf-lib
 * draws in and converting at the boundary is one fewer place to be out by a
 * factor.
 */

/** US Letter, in points. The industry-standard cover letter is a Letter page
 * with one-inch margins, and there is no reason to be clever about it. */
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 72;

export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** 11pt on a 16.5pt leading — the ratio a page of continuous prose is read at.
 * Bigger than a résumé's because a letter is read rather than scanned. */
export const BODY_SIZE = 11;
export const BODY_LEADING = 16.5;
export const PARAGRAPH_GAP = 11;
export const NAME_SIZE = 15;
export const META_SIZE = 9.5;

/** How wide a string is at a size, given a font. The single dependency this
 * module has on the PDF layer, injected so the tests can supply a ruler that
 * needs no font file. */
export type Measure = (text: string, size: number) => number;

/**
 * Break a paragraph into lines that fit `maxWidth`.
 *
 * **The single-word overflow case is the one that matters.** A URL or a
 * hyphenless compound longer than the measure has no break point, and the
 * obvious implementation — "keep taking words until it doesn't fit" — either
 * emits an infinite stream of empty lines or silently drops the word. Here an
 * over-long word is placed on a line of its own and allowed to run wide: a letter
 * with one long line is legible, and a letter missing a word is not.
 */
export function wrapParagraph(
  text: string,
  maxWidth: number,
  size: number,
  measure: Measure,
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measure(candidate, size) <= maxWidth || current === "") {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current !== "") {
    lines.push(current);
  }

  return lines;
}

export interface LetterBlock {
  text: string;
  size: number;
  leading: number;
  font: "regular" | "bold" | "italic";
  /** Space above this block, in points. */
  spaceBefore: number;
}

export interface PlacedLine {
  text: string;
  /** Distance from the top of the page to this line's baseline. pdf-lib draws
   * from the bottom, so the renderer subtracts — kept top-down here because
   * every layout decision is naturally expressed as "how far down". */
  top: number;
  size: number;
  font: LetterBlock["font"];
  /** 0-based page this line belongs to. */
  page: number;
}

/**
 * Lay blocks out down the page, breaking to a new one when the text runs out of
 * room.
 *
 * **Pagination exists because a cover letter that runs long is a real outcome,
 * not a misuse.** The prompt asks for about 250 words and the schema caps each
 * paragraph, but a user with five body paragraphs and a long recipient block can
 * exceed a page — and the failure without this is not an ugly second page, it is
 * text drawn below the bottom edge, invisible, in a file the user sends to an
 * employer.
 */
export function layoutLetter(
  blocks: readonly LetterBlock[],
  measure: (text: string, size: number, font: LetterBlock["font"]) => number,
): { lines: PlacedLine[]; pages: number } {
  const lines: PlacedLine[] = [];
  const bottom = PAGE_HEIGHT - MARGIN;

  let page = 0;
  let cursor = MARGIN;

  for (const block of blocks) {
    const wrapped = wrapParagraph(
      block.text,
      CONTENT_WIDTH,
      block.size,
      (text, size) => measure(text, size, block.font),
    );

    if (wrapped.length === 0) {
      continue;
    }

    // The gap goes before the block, but never as the first thing on a page —
    // a page that opens with eleven points of nothing reads as a mistake.
    if (lines.length > 0 && cursor > MARGIN) {
      cursor += block.spaceBefore;
    }

    for (const text of wrapped) {
      // `cursor` is the top of the line; the baseline sits one leading below it.
      if (cursor + block.leading > bottom) {
        page += 1;
        cursor = MARGIN;
      }

      cursor += block.leading;
      lines.push({ text, top: cursor, size: block.size, font: block.font, page });
    }
  }

  return { lines, pages: page + 1 };
}

/** The date on a letter, in the form an English-language business letter uses.
 * Fixed to `en-GB`-style day-first-free "14 March 2026" via explicit parts
 * rather than `toLocaleDateString`, because the server's locale is not the
 * user's and a letter dated `3/14/2026` for a British employer is wrong in a way
 * nobody would think to test. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function letterDate(when: Date): string {
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
}

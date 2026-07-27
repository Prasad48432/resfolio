import { describe, expect, it } from "vitest";

import {
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  layoutLetter,
  letterDate,
  wrapParagraph,
  type LetterBlock,
} from "./cover-letter-layout";

/**
 * The letter's geometry.
 *
 * These are the failures that produce a *plausible-looking* PDF the user sends
 * to an employer with a sentence missing off the bottom, so they get tests even
 * though nothing here talks to pdf-lib.
 */

/** A ruler with no font behind it: every glyph is half its point size wide. Not
 * realistic, and it does not need to be — what is under test is the arithmetic,
 * and a deterministic measure is what makes the assertions exact. */
const measure = (text: string, size: number) => text.length * size * 0.5;
const measureBlock = (text: string, size: number) => measure(text, size);

describe("wrapParagraph", () => {
  it("breaks on words that exceed the measure", () => {
    const lines = wrapParagraph("one two three four", 30, 10, measure);
    expect(lines.join(" ")).toBe("one two three four");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("keeps a paragraph that fits on one line", () => {
    expect(wrapParagraph("short", 400, 11, measure)).toEqual(["short"]);
  });

  it("loses no words, whatever the measure", () => {
    const text =
      "Acme's platform team is the part of this posting that made me apply for it today";
    const joined = wrapParagraph(text, 120, 11, measure).join(" ");
    expect(joined).toBe(text);
  });

  /**
   * The case the obvious implementation gets wrong: a word with no break point
   * that is wider than the measure. It must go on its own line and run wide, not
   * disappear and not loop.
   */
  it("emits an over-long word rather than dropping it or looping", () => {
    const long = "https://careers.example.com/positions/senior-frontend-engineer";
    const lines = wrapParagraph(`See ${long} now`, 60, 11, measure);
    expect(lines).toContain(long);
    expect(lines.join(" ")).toBe(`See ${long} now`);
  });

  it("has nothing to say about an empty paragraph", () => {
    expect(wrapParagraph("", 400, 11, measure)).toEqual([]);
    expect(wrapParagraph("   ", 400, 11, measure)).toEqual([]);
  });
});

describe("layoutLetter", () => {
  const block = (text: string, spaceBefore = 11): LetterBlock => ({
    text,
    size: 11,
    leading: 16.5,
    font: "regular",
    spaceBefore,
  });

  it("stacks lines down the page", () => {
    const { lines, pages } = layoutLetter(
      [block("Dear Hiring Manager,"), block("A short paragraph.")],
      measureBlock,
    );

    expect(pages).toBe(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.top).toBeLessThan(lines[1]!.top);
    expect(lines[0]!.top).toBeGreaterThanOrEqual(MARGIN);
  });

  // The failure this function exists to prevent: text drawn past the bottom
  // edge, invisible, in a file somebody sends to an employer.
  it("never places a baseline below the bottom margin", () => {
    const long = Array.from({ length: 40 }, (_, index) =>
      block(`Paragraph ${index}. ${"word ".repeat(40)}`),
    );

    const { lines } = layoutLetter(long, measureBlock);

    for (const line of lines) {
      expect(line.top).toBeLessThanOrEqual(PAGE_HEIGHT - MARGIN);
    }
  });

  it("breaks to a second page rather than overflowing", () => {
    const long = Array.from({ length: 40 }, (_, index) =>
      block(`Paragraph ${index}. ${"word ".repeat(40)}`),
    );

    const { lines, pages } = layoutLetter(long, measureBlock);

    expect(pages).toBeGreaterThan(1);
    expect(new Set(lines.map((line) => line.page)).size).toBe(pages);
  });

  it("does not open a page with a paragraph gap", () => {
    const long = Array.from({ length: 40 }, (_, index) =>
      block(`Paragraph ${index}. ${"word ".repeat(40)}`),
    );

    const { lines } = layoutLetter(long, measureBlock);

    for (let page = 0; page < 2; page += 1) {
      const first = lines.find((line) => line.page === page);
      // The first baseline on any page sits exactly one leading below the
      // margin — no gap was carried over from the block that was interrupted.
      expect(first?.top).toBeCloseTo(MARGIN + 16.5, 5);
    }
  });

  it("wraps to the content measure, not the page width", () => {
    const { lines } = layoutLetter([block("word ".repeat(60))], measureBlock);
    for (const line of lines) {
      expect(measure(line.text, line.size)).toBeLessThanOrEqual(CONTENT_WIDTH);
    }
  });

  it("skips a block with nothing in it", () => {
    const { lines } = layoutLetter(
      [block("Kept."), block("   "), block("Also kept.")],
      measureBlock,
    );
    expect(lines.map((line) => line.text)).toEqual(["Kept.", "Also kept."]);
  });
});

describe("letterDate", () => {
  // Explicit parts rather than toLocaleDateString: the server's locale is not
  // the user's, and "3/14/2026" on a letter to a British employer is wrong in a
  // way nobody would think to test for.
  it("writes a date a business letter would carry", () => {
    expect(letterDate(new Date(2026, 2, 14))).toBe("14 March 2026");
    expect(letterDate(new Date(2026, 11, 1))).toBe("1 December 2026");
  });
});

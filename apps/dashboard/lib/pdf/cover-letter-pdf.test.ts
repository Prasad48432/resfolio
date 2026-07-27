import { describe, expect, it } from "vitest";

import { renderCoverLetterPdf } from "./cover-letter-pdf";

/**
 * The letter, actually drawn.
 *
 * **This is a deployment test as much as a rendering one.** The typefaces are
 * vendored files read from `process.cwd()` at request time, which is the class of
 * dependency that works on every developer's machine and is missing from the
 * bundle — and the symptom is a 500 on a download button, discovered by a user.
 * Rendering one real letter proves the files are found, that fontkit is
 * registered, and that pdf-lib produced a file rather than a promise of one.
 *
 * The fixture is deliberately hostile: smart quotes, an em dash, an ellipsis, a
 * non-breaking space, accented Latin and a bullet. **pdf-lib throws on a
 * character the embedded font cannot encode**, so without `sanitize` any one of
 * those would fail the whole download — and every one of them is something a
 * model writes without being asked.
 */
const LETTER = {
  opening:
    "Acme’s platform team is the part of this posting I want — “the design system” and the 4,000-user dashboard are what I’ve spent three years on…",
  body: [
    `At Northwind I rebuilt the billing dashboard in React and TypeScript, cutting first paint from 4s to 900ms. ${"That meant measuring far more than rewriting. ".repeat(6)}`,
    "I own our component library • three teams build against it, including one that had never used it before. Émigré ünïcödé survives too.",
  ],
  closing: "I’d welcome a conversation about the platform work.",
  recipient: "Dr. Chen",
};

/**
 * **A raised timeout, and not a papered-over flake.** Vitest's 5s default is
 * generous for pure logic and tight for this: the first call in a process reads
 * ~1MB of TTF from disk and subsets three typefaces, which took 6.8s on a cold
 * cache while thirteen other suites were running in parallel — passing in
 * isolation and failing in `turbo test`, which is the worst way for a test to
 * fail. The work is genuinely this size; the default was the wrong measure for
 * it.
 */
const EMBED_TIMEOUT = 30_000;

describe("renderCoverLetterPdf", () => {
  it("produces a real PDF from a letter full of characters a model writes", async () => {
    const bytes = await renderCoverLetterPdf({
      letter: LETTER,
      signature: "Sai Prasad Reddy",
      email: "prasad@example.com",
      phone: "+91 90000 00000",
      location: "Hyderabad, India",
      role: "Senior Frontend Engineer",
      company: "Acme",
      now: new Date(2026, 2, 14),
    });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    // Three subsetted typefaces plus a page of text. A few hundred bytes would
    // mean the fonts silently failed to embed.
    expect(bytes.byteLength).toBeGreaterThan(5_000);
  }, EMBED_TIMEOUT);

  it("draws a letter with no contact details and no recipient", async () => {
    // "Dear Hiring Manager" is the correct letter when nobody is named, not a
    // fallback to apologise for — and a profile with no phone number is normal.
    const bytes = await renderCoverLetterPdf({
      letter: {
        opening: "Short and unaddressed.",
        body: ["One paragraph."],
        closing: "Thanks for reading.",
      },
      signature: "A Name",
      now: new Date(2026, 2, 14),
    });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  }, EMBED_TIMEOUT);
});

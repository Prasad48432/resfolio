import "server-only";

import fontkit from "@pdf-lib/fontkit";
import type { CoverLetterContent } from "@resfolio/job";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BODY_LEADING,
  BODY_SIZE,
  MARGIN,
  META_SIZE,
  NAME_SIZE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PARAGRAPH_GAP,
  layoutLetter,
  letterDate,
  type LetterBlock,
} from "./cover-letter-layout";

/**
 * Cover letters as PDF (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **Composed with `pdf-lib`, not rendered by a browser, and that is a different
 * decision from the resume's.** A resume is a *template* — arbitrary CSS, per
 * template, with a preview the user configures against — so it needs a real
 * rendering engine, which is why `apps/sites` hands resume export to a headless
 * Chromium on Fly. A cover letter is one fixed layout that has not changed since
 * the typewriter: a header, a date, a salutation, three paragraphs, a sign-off.
 * Drawing it directly means no Chromium, no second service on the request path,
 * no `RENDER_SECRET` hop, and a file produced in single-digit milliseconds — and
 * it means letters keep working in environments where PDF export is switched off
 * entirely.
 *
 * **The fonts are vendored, and they have to be.** `@pdf-lib/fontkit` embeds a
 * real typeface rather than falling back to one of the fourteen PDF base fonts,
 * which are metrically fine and look like a 1994 fax. PT Serif is here for a
 * mundane reason as much as an aesthetic one: it ships **static Regular, Bold and
 * Italic** files, and pdf-lib embeds the default instance of a variable font with
 * no way to select a weight — so a variable family (Lora, Libre Baskerville, and
 * most of what Google Fonts ships today) gives you one weight and a bold that
 * silently is not bold. The licence sits beside the files.
 *
 * Everything about *where things go* is in `cover-letter-layout.ts`, which is
 * pure and tested. This module embeds fonts and draws.
 */

const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");

interface LetterFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/**
 * The font bytes, read once per process.
 *
 * A megabyte of TTF read from disk on every download would be a megabyte of
 * disk read on every download. Cached as the *bytes* rather than as embedded
 * fonts, because a `PDFFont` belongs to the document that embedded it and
 * reusing one across documents corrupts both.
 */
let fontBytes: Promise<Record<keyof LetterFonts, Buffer>> | null = null;

function loadFontBytes(): Promise<Record<keyof LetterFonts, Buffer>> {
  fontBytes ??= (async () => {
    const [regular, bold, italic] = await Promise.all([
      readFile(path.join(FONT_DIR, "PTSerif-Regular.ttf")),
      readFile(path.join(FONT_DIR, "PTSerif-Bold.ttf")),
      readFile(path.join(FONT_DIR, "PTSerif-Italic.ttf")),
    ]);
    return { regular, bold, italic };
  })();
  return fontBytes;
}

export interface CoverLetterPdfInput {
  letter: CoverLetterContent;
  /** The user's own name, from the profile. **The letter is signed by the
   * platform, never by the model** — there is no field for a sign-off, so an
   * invented name has nowhere to live and the user's cannot be misspelled. */
  signature: string;
  /** Shown under the name when the profile has them. Optional because a letter
   * with no contact line is a letter, and inventing one is not an option. */
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  role?: string | null;
  company?: string | null;
  /** Injected so a test can pin the date. */
  now?: Date;
}

/**
 * The blocks of a letter, in reading order.
 *
 * The salutation is composed here from the recipient the user typed, exactly as
 * the on-screen letter composes it — **the model never writes a greeting**, and
 * "Dear Hiring Manager" is the correct letter when nobody is named rather than a
 * fallback to apologise for.
 */
function letterBlocks(input: CoverLetterPdfInput): LetterBlock[] {
  const { letter } = input;
  const blocks: LetterBlock[] = [];

  blocks.push({
    text: input.signature,
    size: NAME_SIZE,
    leading: NAME_SIZE * 1.3,
    font: "bold",
    spaceBefore: 0,
  });

  const contact = [input.email, input.phone, input.location]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("  ·  ");

  if (contact !== "") {
    blocks.push({
      text: contact,
      size: META_SIZE,
      leading: META_SIZE * 1.5,
      font: "regular",
      spaceBefore: 2,
    });
  }

  blocks.push({
    text: letterDate(input.now ?? new Date()),
    size: META_SIZE,
    leading: META_SIZE * 1.5,
    font: "regular",
    spaceBefore: 22,
  });

  const target = [input.role, input.company]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (target.length > 0) {
    blocks.push({
      text: `Re: ${target.join(", ")}`,
      size: BODY_SIZE,
      leading: BODY_LEADING,
      font: "italic",
      spaceBefore: 14,
    });
  }

  const recipient = letter.recipient?.trim();
  blocks.push({
    text: recipient ? `Dear ${recipient},` : "Dear Hiring Manager,",
    size: BODY_SIZE,
    leading: BODY_LEADING,
    font: "regular",
    spaceBefore: 18,
  });

  for (const paragraph of [letter.opening, ...letter.body, letter.closing]) {
    blocks.push({
      text: paragraph,
      size: BODY_SIZE,
      leading: BODY_LEADING,
      font: "regular",
      spaceBefore: PARAGRAPH_GAP,
    });
  }

  blocks.push({
    text: "Sincerely,",
    size: BODY_SIZE,
    leading: BODY_LEADING,
    font: "regular",
    spaceBefore: 18,
  });

  blocks.push({
    text: input.signature,
    size: BODY_SIZE,
    leading: BODY_LEADING,
    font: "regular",
    spaceBefore: 18,
  });

  return blocks;
}

/**
 * Draw the letter and return the file's bytes.
 *
 * `Uint8Array`, not a `Buffer`: the caller hands it straight to a `Response`,
 * and pdf-lib's own return type is what the Web platform wants.
 */
export async function renderCoverLetterPdf(
  input: CoverLetterPdfInput,
): Promise<Uint8Array> {
  const bytes = await loadFontBytes();

  const pdf = await PDFDocument.create();
  // Required before `embedFont` will accept a TTF at all — pdf-lib's built-in
  // embedder handles only the fourteen standard fonts.
  pdf.registerFontkit(fontkit);

  const fonts: LetterFonts = {
    regular: await pdf.embedFont(bytes.regular, { subset: true }),
    bold: await pdf.embedFont(bytes.bold, { subset: true }),
    italic: await pdf.embedFont(bytes.italic, { subset: true }),
  };

  pdf.setTitle(
    [input.role, input.company].filter(Boolean).join(" — ") || "Cover letter",
  );
  pdf.setAuthor(input.signature);
  pdf.setCreator("Resfolio");
  pdf.setProducer("Resfolio");

  const { lines, pages } = layoutLetter(
    letterBlocks(input),
    (text, size, font) => fonts[font].widthOfTextAtSize(sanitize(text), size),
  );

  const sheets = Array.from({ length: pages }, () =>
    pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
  );

  const ink = rgb(0.09, 0.09, 0.09);

  for (const line of lines) {
    const sheet = sheets[line.page];
    if (!sheet) {
      continue;
    }
    sheet.drawText(sanitize(line.text), {
      x: MARGIN,
      // The layout measures downward from the top; pdf-lib's origin is the
      // bottom-left. One subtraction, in one place.
      y: PAGE_HEIGHT - line.top,
      size: line.size,
      font: fonts[line.font],
      color: ink,
    });
  }

  return pdf.save();
}

/**
 * Replace what the embedded font cannot draw.
 *
 * **pdf-lib throws on an unencodable character rather than dropping it**, so a
 * single smart quote or an emoji in a model-written sentence would fail the whole
 * download with a stack trace instead of producing a letter. PT Serif covers
 * Latin and Cyrillic comfortably; what it does not cover is mostly punctuation the
 * model reaches for, so the common cases are mapped to their ASCII equivalents
 * and anything left is dropped rather than allowed to throw.
 */
function sanitize(text: string): string {
  return (
    text
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      // **Escapes, not the characters themselves.** A non-breaking space
      // that looks exactly like a space is the reason
      // `no-irregular-whitespace` exists, and this line is a *map* of them
      // — writing them literally makes the one line that must be readable
      // the one line nobody can read.
      .replace(/[\u00a0\u2007\u202f]/g, " ")
      .replace(/•/g, "·")
      // Anything left outside Latin-1. Newlines never reach here — the
      // layout has already broken the text into lines.
      .replace(/[^ -ÿ]/g, "")
  );
}

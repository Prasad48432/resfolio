/**
 * ATS text-extraction check (docs/architecture/02-resume-rendering.md §
 * "ATS compatibility"). Opens the exported PDF's real text layer and asserts
 * the name, every section heading, and representative content are present in
 * correct reading order, and that visible URLs survive as text. This is the
 * per-template ATS check the doc calls for, runnable now against the local
 * export. Run `pnpm --filter sites export:pdf` first.
 *
 * Usage: pnpm --filter sites check:ats [fixtureKey]   (default: ada)
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { resumeClassic } from "@resfolio/template-resume-classic";
// The legacy build runs in Node without a worker or canvas — text only.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { renderKey } from "../lib/render-key.ts";

const fixtureKey = process.argv[2] ?? "ada";

const key = renderKey(
  {
    source: "fixture",
    ref: fixtureKey,
    templateId: resumeClassic.id,
    config: { ...resumeClassic.defaultConfig },
    view: undefined,
  },
  resumeClassic.version,
);
const pdfPath = join(process.cwd(), "out", `${key}.pdf`);

let bytes: Buffer;
try {
  bytes = await readFile(pdfPath);
} catch {
  console.error(
    `No exported PDF at ${pdfPath}. Run: pnpm --filter sites export:pdf ${fixtureKey}`,
  );
  process.exit(1);
}

const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
let text = "";
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  text +=
    content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ") + "\n";
}
// Case-insensitive: headings are uppercased by CSS `text-transform`, so the
// text layer reads "EXPERIENCE" — still ATS-legible, order still preserved.
const haystack = text.toLowerCase();

interface AtsExpectation {
  /** Must appear, and in this relative order (reading order). */
  ordered: string[];
  /** Must appear somewhere — a visible URL surviving as extractable text. */
  present: string[];
}

const EXPECTED: Record<string, AtsExpectation> = {
  ada: {
    ordered: [
      "Ada Okonkwo",
      "Experience",
      "Northwind Systems",
      "Projects",
      "fluxlog",
      "Skills",
      "Education",
      "TU Berlin",
    ],
    present: ["ada.example.com"],
  },
};

const expected = EXPECTED[fixtureKey];
if (!expected) {
  console.error(`No ATS expectations defined for fixture "${fixtureKey}".`);
  process.exit(1);
}

const failures: string[] = [];
let lastIndex = -1;
for (const token of expected.ordered) {
  const at = haystack.indexOf(token.toLowerCase());
  if (at === -1) {
    failures.push(`missing: "${token}"`);
  } else if (at < lastIndex) {
    failures.push(`out of reading order: "${token}"`);
  } else {
    lastIndex = at;
  }
}
for (const token of expected.present) {
  if (!haystack.includes(token.toLowerCase())) {
    failures.push(`missing visible URL: "${token}"`);
  }
}

if (failures.length > 0) {
  console.error("ATS check FAILED:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const tokenCount = expected.ordered.length + expected.present.length;
console.log(
  `ATS check passed — ${tokenCount} tokens present (headings in reading order), across ${doc.numPages} page(s).`,
);

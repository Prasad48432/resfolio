import type { ResumeEditorialConfig } from "./config";

/**
 * The template's self-contained stylesheet, emitted as a `<style>` block by the
 * Document so it renders identically on every host (dashboard preview, apps/sites
 * print route, Playwright PDF). All dimensions are **physical units** (mm/pt) —
 * never viewport units — so layout is resolution-independent (doc 02). Colours
 * and fonts come from `--rf-*` theme tokens.
 *
 * The look is a **serif, monochrome, centred-masthead** resume: a centred name
 * over a `|`-separated contact line, then sections whose uppercase title sits on
 * a full-width rule, and two-column entry rows (title left / dates right, an
 * italic subtitle left / location right). It is set in Lora with Georgia-flavoured
 * italics — see `theme.ts`.
 *
 * Two contexts share one sheet: on screen `.rf-page` paints a real page box; in
 * print `@page` owns size + margins and the box collapses. Both go through
 * Chromium with the same CSS + fonts, so measured boundaries match actual breaks
 * (the parity guarantee, doc 09).
 */

const PAGE = {
  A4: { w: "210mm", h: "297mm", css: "A4" },
  LETTER: { w: "216mm", h: "279mm", css: "Letter" },
} as const;

const MARGIN = {
  compact: "12mm",
  normal: "15mm",
  relaxed: "19mm",
} as const;

/**
 * The master type scale — every font size in this template, in one table, emitted
 * as `--rf-size-*` custom properties. A rule can never quietly re-introduce a
 * literal `pt`, which is what makes the master size a single config switch.
 *
 * `small` is not a uniform multiplier: body copy takes the full reduction (that
 * is where the space is) while the name and section titles drop less, so the
 * hierarchy that makes the page scannable survives the squeeze.
 */
const TYPE_SCALE = {
  medium: {
    body: "10pt",
    name: "21pt",
    contact: "9.4pt",
    sectionTitle: "10.5pt",
    entryTitle: "10.5pt",
    entrySubtitle: "10pt",
    dates: "10pt",
    tags: "10pt",
    links: "9.6pt",
  },
  small: {
    body: "9.3pt",
    name: "18pt",
    contact: "8.8pt",
    sectionTitle: "10pt",
    entryTitle: "9.8pt",
    entrySubtitle: "9.3pt",
    dates: "9.3pt",
    tags: "9.3pt",
    links: "9pt",
  },
} as const;

export function buildResumeStyles(config: ResumeEditorialConfig): string {
  const page = PAGE[config.pageSize];
  const margin = MARGIN[config.margin];
  const type = TYPE_SCALE[config.fontSize];

  return `
@page { size: ${page.css}; margin: ${margin}; }

.rf-page {
  box-sizing: border-box;
  --rf-size-body: ${type.body};
  --rf-size-name: ${type.name};
  --rf-size-contact: ${type.contact};
  --rf-size-section-title: ${type.sectionTitle};
  --rf-size-entry-title: ${type.entryTitle};
  --rf-size-entry-subtitle: ${type.entrySubtitle};
  --rf-size-dates: ${type.dates};
  --rf-size-tags: ${type.tags};
  --rf-size-links: ${type.links};
  width: ${page.w};
  min-height: ${page.h};
  padding: ${margin};
  margin: 0 auto;
  background: #ffffff;
  color: var(--rf-ink);
  font-family: var(--rf-font-body);
  font-size: var(--rf-size-body);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.rf-page * { box-sizing: border-box; }

/* ── Masthead ─────────────────────────────────────────────────────────
   The name is centred, then a single contact line with vertical-bar
   separators drawn by CSS (so the last item never trails one and an absent
   field leaves no orphan bar). */
.rf-header { text-align: center; margin-bottom: 9pt; }
.rf-name {
  margin: 0;
  font-size: var(--rf-size-name);
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.1;
}
.rf-contact {
  margin-top: 4pt;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
  gap: 0 7pt;
  font-size: var(--rf-size-contact);
  color: var(--rf-ink);
}
.rf-contact-item { display: inline-flex; align-items: center; gap: 3pt; }
/* The separators: a bar before every item after the first. Drawn here, never
   typed into the data, so items reorder and drop cleanly. */
.rf-contact-item + .rf-contact-item::before {
  content: "|";
  margin-right: 7pt;
  color: var(--rf-muted);
}
.rf-contact-item svg { width: 9px; height: 9px; flex: none; color: var(--rf-accent); }
.rf-contact a { color: inherit; text-decoration: none; }

/* ── Sections ─────────────────────────────────────────────────────────
   Uppercase title sitting on a full-width rule — the reference's signature. */
.rf-section { margin-top: 11pt; }
.rf-section-title {
  margin: 0 0 4pt;
  padding-bottom: 2pt;
  border-bottom: 0.9pt solid var(--rf-rule);
  font-size: var(--rf-size-section-title);
  font-weight: 700;
  /* No positive letter-spacing: it makes Chromium emit each glyph as its own
     run, so the PDF text layer reads "E X P E R I E N C E" — an ATS hazard.
     Uppercase alone extracts cleanly. */
  text-transform: uppercase;
  color: var(--rf-ink);
  break-after: avoid;
}

.rf-summary { margin: 0; }

/* ── Entries ──────────────────────────────────────────────────────────
   Two justified rows: a bold title with dates opposite, then an italic
   subtitle with a location opposite. Either side of either row may be empty
   and the row still balances. */
.rf-entry { margin-top: 7pt; break-inside: avoid; }
.rf-entry:first-of-type { margin-top: 2pt; }
.rf-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10pt;
}
.rf-entry-title {
  margin: 0;
  font-size: var(--rf-size-entry-title);
  font-weight: 700;
  line-height: 1.3;
}
/* The " | tech" that trails a project name is set italic, in the body weight. */
.rf-entry-tech { font-weight: 400; font-style: italic; }
.rf-entry-subtitle {
  margin: 0;
  font-size: var(--rf-size-entry-subtitle);
  font-style: italic;
  color: var(--rf-ink);
}
.rf-entry-side {
  flex: none;
  text-align: right;
  white-space: nowrap;
}
.rf-dates {
  flex: none;
  font-size: var(--rf-size-dates);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rf-entry-loc {
  flex: none;
  font-size: var(--rf-size-entry-subtitle);
  font-style: italic;
  color: var(--rf-ink);
  white-space: nowrap;
}

.rf-entry-body { margin-top: 2pt; }

/* ── Bullets ──────────────────────────────────────────────────────────
   A dash marker, not a disc — the reference's list style. list-style is
   declared explicitly (not left to the UA) because a host may reset lists in
   its own base layer (the dashboard imports Tailwind, whose preflight sets
   ul { list-style: none }); a template must render the same on any host. The
   ::marker content draws the dash; the disc keyword is the fallback if a
   renderer ignores it. (This sheet is a TS template literal: no backticks in
   these comments.) */
.rf-highlights { margin: 2pt 0 0; padding-left: 12pt; list-style: disc outside; }
.rf-highlights li { margin: 1.5pt 0; padding-left: 2pt; }
.rf-highlights li::marker { content: "–  "; color: var(--rf-ink); }

/* Markdown lists inside rich text, styled identically so a typed list and a
   structured highlight are indistinguishable on the page. */
.rf-rich-list { margin: 2pt 0 0; padding-left: 12pt; list-style: disc outside; }
.rf-rich-list li { margin: 1.5pt 0; padding-left: 2pt; }
.rf-rich-list li::marker { content: "–  "; color: var(--rf-ink); }

/* ── Skills, tags, links ──────────────────────────────────────────────── */
.rf-skill-group { margin-top: 3pt; break-inside: avoid; }
.rf-skill-group:first-of-type { margin-top: 0; }
.rf-skill-name { font-weight: 700; }

.rf-tags { margin-top: 2pt; font-size: var(--rf-size-tags); font-style: italic; }

.rf-links {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 0 6pt;
  font-size: var(--rf-size-links);
  white-space: nowrap;
}
.rf-links a { color: var(--rf-accent); text-decoration: none; }
.rf-links a + a::before { content: "|"; margin-right: 6pt; color: var(--rf-muted); }

.rf-langs { display: flex; flex-wrap: wrap; gap: 2pt 14pt; }
.rf-lang-name { font-weight: 700; }
.rf-lang-fluency { font-style: italic; color: var(--rf-muted); }

/* Scoped to .rf-page (via zero-specificity :where) so the self-contained sheet
   never leaks bare a/strong rules when the template renders in-browser inside
   the dashboard preview — while staying low enough that the link rules above
   still win (doc 08/09). */
.rf-page :where(a) { color: var(--rf-accent); }
.rf-page :where(strong) { font-weight: 700; }
.rf-page :where(em) { font-style: italic; }

@media print {
  .rf-page {
    width: auto;
    min-height: 0;
    padding: 0;
    margin: 0;
  }
}
`.trim();
}

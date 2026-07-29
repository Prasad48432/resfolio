# @resfolio/template-resume-editorial — the serif resume template

Resfolio's second resume template (docs/architecture/02-resume-rendering.md,
05-template-sdk.md). A **serif, monochrome, centred-masthead** resume:

- A centred name over a single `|`-separated contact line (phone · email ·
  links — location stays in the entries, not the masthead).
- Uppercase section titles sitting on a **full-width rule**.
- Two justified rows per entry: a **bold** title with dates opposite, an
  _italic_ subtitle with a location opposite.
- Projects put the tech list on the title line as an italic `| …` clause, with
  outbound links opposite (a github.com repo is labelled "GitHub", else "Code").
- Dash (`–`) bullet markers; skills as `Name: a | b | c`.

Modelled on `resume-classic`'s structure (same section renderers, same
`renderRichText` for bold/italic/lists, same `<style>`-block delivery, same
physical-unit CSS), so it inherits the ATS-safety and preview↔PDF parity
guarantees. What differs is presentation only.

## Typography

Set in **Lora**, referenced as `var(--font-lora)` in `theme.ts`'s
`--rf-font-body`. Both apps self-host Lora via `next/font` (weights 400–700,
**normal + italic**) and expose `--font-lora` on `<html>` — the same file backs
the dashboard preview and the apps/sites PDF, which is where parity comes from
(doc 02). The fallback stack is `Georgia, 'Times New Roman', serif`, so a host
that provides no Lora still renders a serif with Georgia-flavoured italics.

> Georgia itself is not embedded (it is a licensed Microsoft face, and embedding
> a system-only font would break the "same font everywhere" parity). Lora's
> italic stands in on the real hosts; Georgia only appears where a browser has
> it and Lora is absent.

**Dates carry no `tabular-nums` and no `letter-spacing`, and both absences are
deliberate.** Tabular figures give every digit the widest digit's advance, so in
Lora "Jul 2025" renders as though tracking had been applied to it — and they buy
nothing here, since the dates sit at the right edge of a flex row rather than in
an aligned column. Tracking is the wrong fix in either direction: any non-zero
`letter-spacing` makes Chromium emit each glyph as its own run, so the PDF's text
layer reads "2 0 2 5" and an ATS parses the date as noise. The tightening that
remains is `word-spacing` only (Lora's word space is wide), which leaves each
date one extractable run.

## Config — identical shape to `resume-classic`, on purpose

`config.ts` declares the exact same six keys (page size, margin, accent, icons,
font scale, hidden links). That structural identity is load-bearing: the
dashboard's **one** resume editor form and preview are generic over "a resume
config", so a second template needs no second form. Only the **defaults** differ
— this template is monochrome, so it defaults to a near-black accent and
`showIcons: false` (the reference is a text-only masthead). If you add a knob
here that `resume-classic` lacks, you have broken that contract — add it to both,
or make the editor schema-driven first.

## Registration

A resume template is dead until it is registered in **both** hosts (kept in sync
by hand):

- `apps/sites/lib/templates.ts` — the render host (public page + PDF export).
- `apps/dashboard/lib/resume-templates.ts` — create (seeds `defaultConfig` +
  `defaultSectionOrder`) and preview.

One resume per template is enforced in `@resfolio/document`'s `createDocument`;
the dashboard's "New resume" menu reflects which templates are already in use.

## Tests

`src/render.test.tsx` renders the real document from `@resfolio/fixtures`
(every-section + sparse) and from a hand-built copy of the reference resume
(masthead, bold inline numbers, project tech/links, inline skills, the Lora
token). It renders **server output only** — the resume carries no client JS.

import { z } from "zod";

import { createItemId } from "./ids";
import { CALENDAR_DATE_PATTERN } from "./schema/primitives";
import {
  profileSchema,
  SECTION_ITEM_SCHEMAS,
  type Profile,
  type SectionItemMap,
} from "./schema/profile";
import { createEmptyProfile, type SeedIdentity } from "./seed";

/**
 * Resume intake — turning an uploaded resume into a Profile
 * (docs/architecture/01-profile-engine.md, 16-onboarding.md).
 *
 * This is what onboarding's "upload your resume" option writes. It lives here,
 * beside `proposal.ts`, for the same reason that one does: nothing in the file
 * is model-facing. It declares a shape, sanitises values, and builds a `Profile`
 * through this package's own schemas. No SDK, no provider, no prompt — those
 * stay in `apps/dashboard/lib/ai/` (doc 13). Where the extraction came from is
 * not this file's business, which is why the tests need no model.
 *
 * ## Why this may add content when `proposal.ts` may not
 *
 * `proposal.ts` has no "add" variant, because a model proposing a new role is
 * inventing a job. Here adding *is* the operation: the user handed us a document
 * about themselves and asked for it to be typed in. The invariant that replaces
 * "no adding" is **nothing may be produced that the document did not contain**,
 * and the guarantees behind it are different in kind:
 *
 * 1. **The extraction is transcription, not authorship.** Every field is copied
 *    prose or a copied fact; there is no field for a rewritten summary, an
 *    inferred seniority, or a skill the model thinks is implied. The prompt asks
 *    for that too, but the schema is what leaves an embellishment nowhere to go.
 * 2. **Every item re-parses through the section's own Zod schema**, exactly as a
 *    proposal does. Model output is hostile input and is not privileged
 *    (doc 10) — the `richTextSchema` that rejects raw HTML from a keyboard
 *    rejects it from a PDF.
 * 3. **A bad item is dropped, never repaired into something else, and never
 *    fatal.** One unreadable date in a five-role resume must not cost the other
 *    four roles. So fragile *fields* normalise to absent (see below) and only a
 *    genuinely empty required field — a role with no company — drops the item.
 * 4. **The count of what landed is returned, and the caller shows that rather
 *    than the extraction's own length.** This is `proposal.ts`' rule that a diff
 *    may not promise what applying will not deliver: a screen saying "5 roles"
 *    over a profile holding 4 is worse than one saying 4.
 * 5. **Every item carries `source: "resume"`.** Not `manual` — nobody typed it.
 *    An item that reads oddly is then a transcription to check rather than a
 *    sentence the user is standing behind.
 *
 * The user is the last layer and the one that matters most: nothing here writes.
 * `buildProfileFromResume` returns a `Profile` for a human to look at, and only
 * a Server Action they triggered stores it.
 */

/**
 * How many items one section may contribute.
 *
 * Well below the profile schema's own maxima (100 experience items), because
 * this bounds a *model's output* rather than a career: it is the cost control,
 * and a resume listing more than twenty of anything has a tail nobody reads. It
 * caps the model-facing schema, so it is enforced before generation rather than
 * by discarding tokens already paid for.
 */
export const MAX_INTAKE_ITEMS = 20;

/** Bullets per item, and terms per skill group — the same reasoning, one level
 * down. */
const MAX_INTAKE_BULLETS = 12;
const MAX_INTAKE_TERMS = 40;

/**
 * A field in the model-facing schema.
 *
 * **Nothing here is `.optional()`, and nothing is a union.** Both are rules this
 * repository has paid for: strict structured output requires every property to
 * be present (`tailor.ts`), and Zod emits `oneOf` for a discriminated union,
 * which OpenAI's strict `response_format` rejects outright with a 400 before a
 * token is generated (`proposal.ts`). So absence is the empty string — which a
 * model expresses far more reliably than an omission anyway, and which already
 * reads as absent everywhere in this package.
 *
 * The maxima are generous rather than exact. This schema's job is to bound the
 * output; the *real* limits are the section schemas each value is re-parsed
 * through afterwards, and a value that overruns is clamped by {@link text}
 * rather than failing the extraction.
 */
const line = (max: number) => z.string().max(max);

const intakeLinkSchema = z.object({
  /** "GitHub", "Portfolio". Empty is fine — {@link linkLabel} derives one from
   * the host, which is labelling rather than invention. */
  label: line(120),
  url: line(2_048),
});

const intakeBasicsSchema = z.object({
  /** As the resume spells it. The one field where the document outranks the
   * OAuth account: the name on the resume is the professional name, whatever
   * Google returned. */
  name: line(200),
  /** The resume's own summary / profile / objective paragraph, verbatim.
   * Bulleted summaries become sentences via {@link prose} — the profile schema
   * forbids lists here, and losing the whole summary to a stray "-" would be a
   * silent failure. */
  summary: line(2_000),
  location: line(200),
  email: line(320),
  phone: line(60),
  /** A personal site, if the resume prints one. */
  website: line(2_048),
  /** Everything else linked in the header — GitHub, LinkedIn, a portfolio. */
  links: z.array(intakeLinkSchema).max(12),
});

/**
 * A date, as the model is asked to normalise it: `YYYY-MM`, or `YYYY` when the
 * resume gave only a year, or `""` for an ongoing role. {@link calendarDate}
 * recovers the human spellings anyway ("Jan 2020", "03/2020") — the prompt and
 * the normaliser are belt and braces, and the normaliser is the tested one.
 */
const intakeDate = line(40);

const intakeExperienceSchema = z.object({
  company: line(200),
  role: line(200),
  location: line(200),
  startDate: intakeDate,
  /** Empty means the role is current. */
  endDate: intakeDate,
  /** The paragraph under the title, where the resume has one. */
  summary: line(2_000),
  /** The bullet points, one per entry, markers stripped. */
  highlights: z.array(line(1_000)).max(MAX_INTAKE_BULLETS),
});

const intakeEducationSchema = z.object({
  institution: line(200),
  /** "BSc", "MEng" — the qualification. */
  degree: line(160),
  /** The field of study. */
  area: line(200),
  location: line(200),
  startDate: intakeDate,
  endDate: intakeDate,
  /** A GPA or classification, as printed. */
  score: line(80),
  highlights: z.array(line(1_000)).max(MAX_INTAKE_BULLETS),
});

const intakeProjectSchema = z.object({
  name: line(200),
  description: line(2_000),
  url: line(2_048),
  repoUrl: line(2_048),
  technologies: z.array(line(80)).max(MAX_INTAKE_TERMS),
  highlights: z.array(line(1_000)).max(MAX_INTAKE_BULLETS),
});

const intakeSkillGroupSchema = z.object({
  /** The heading the resume grouped these under — "Languages", "Cloud". A flat
   * list is one group: the model is told to keep the page's own grouping rather
   * than to invent categories, because grouping is a judgement about someone's
   * competences and this step makes no judgements. */
  name: line(120),
  skills: z.array(line(80)).max(MAX_INTAKE_TERMS),
});

const intakeWritingSchema = z.object({
  title: line(300),
  /** The journal, conference or publication. */
  publisher: line(200),
  url: line(2_048),
  date: intakeDate,
});

const intakeCertificationSchema = z.object({
  name: line(300),
  issuer: line(200),
  date: intakeDate,
  url: line(2_048),
});

const intakeAwardSchema = z.object({
  title: line(300),
  awarder: line(200),
  date: intakeDate,
  summary: line(1_000),
});

const intakeLanguageSchema = z.object({
  name: line(120),
  /** "Native", "Fluent" — as printed. Never upgraded, never guessed. */
  fluency: line(120),
});

/**
 * What a model is asked to return for one resume.
 *
 * The section list is the Profile's, minus `custom`: a custom section needs a
 * heading the user chose, and inventing one for "everything else on the page"
 * would file unclassified text under a name nobody picked. Content with no home
 * in this shape is simply not extracted — the honest outcome, given the profile
 * editor is one click away and the resume is still on the user's disk.
 */
export const resumeExtractionSchema = z.object({
  basics: intakeBasicsSchema,
  experience: z.array(intakeExperienceSchema).max(MAX_INTAKE_ITEMS),
  education: z.array(intakeEducationSchema).max(MAX_INTAKE_ITEMS),
  projects: z.array(intakeProjectSchema).max(MAX_INTAKE_ITEMS),
  skills: z.array(intakeSkillGroupSchema).max(MAX_INTAKE_ITEMS),
  writing: z.array(intakeWritingSchema).max(MAX_INTAKE_ITEMS),
  certifications: z.array(intakeCertificationSchema).max(MAX_INTAKE_ITEMS),
  awards: z.array(intakeAwardSchema).max(MAX_INTAKE_ITEMS),
  languages: z.array(intakeLanguageSchema).max(MAX_INTAKE_ITEMS),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

/** The sections intake can fill — the keys the review screen counts. */
export const INTAKE_SECTION_KEYS = [
  "experience",
  "education",
  "projects",
  "skills",
  "writing",
  "certifications",
  "awards",
  "languages",
] as const;

export type IntakeSectionKey = (typeof INTAKE_SECTION_KEYS)[number];

export interface ResumeImportResult {
  /** Ready to store, already through `profileSchema`. */
  profile: Profile;
  /**
   * How many items each section actually gained — what the review screen shows.
   * Derived from the built profile, never from the extraction's length, so a
   * dropped item cannot be counted.
   */
  counts: Record<IntakeSectionKey, number>;
  /** Items the section schema refused. Surfaced rather than swallowed: it is the
   * one number that says "the document had more in it than this". */
  dropped: number;
  /** Whether the resume supplied a summary paragraph. */
  hasSummary: boolean;
}

/** A complete HTML tag, and then any surviving opener. Both go, rather than
 * being left to fail the item: `richTextSchema` refuses anything matching
 * `<[a-z!/]`, and a stray `<span` from a PDF's text layer is an extraction
 * artifact — losing a whole role to one is not a trade worth making. */
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_OPENER = /<(?=[a-z!/])/gi;

/**
 * The invisible debris a PDF text layer is full of: control characters (bar
 * `\n`, which carries the line structure {@link prose} and {@link bullets}
 * read), the exotic spaces, the zero-width set, and a BOM.
 *
 * They matter because they are **invisible in every direction**. A job title
 * ending in a zero-width joiner still renders as the title, still fails an
 * equality check, and still defeats the keyword search behind the job-match
 * screen — so the bug caused by one gets reported as "the match says I don't
 * have my own job title" and diagnosed nowhere near here.
 */
const INVISIBLE = /(?!\n)[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/gu;

/** Bullet and dash markers a PDF's text layer prefixes list items with. The
 * profile's renderers draw the bullet, so a retained marker double-bullets the
 * line — and `- ` at the start of a summary is a list, which
 * `inlineRichTextSchema` rejects outright. */
const LIST_MARKER = /^\s*(?:[-–—*•‣▪·]|\d+[.)])\s+/;

/** Trim, drop the debris, neutralise raw HTML, clamp. The clamp is deliberately
 * silent: a value over the section schema's maximum is a transcription that ran
 * long, not a reason to lose the item. */
function text(value: string, max: number): string {
  return value
    .replace(HTML_TAG, "")
    .replace(HTML_OPENER, "")
    .replace(INVISIBLE, " ")
    .trim()
    .slice(0, max);
}

/** A single-line field: the above, with internal runs of whitespace collapsed.
 * A company name split across two lines of a two-column resume arrives with a
 * newline in it. */
function inline(value: string, max: number): string {
  return text(value, max).replace(/\s+/g, " ").trim();
}

/**
 * Prose for a field that may not contain a list (`basics.summary`).
 *
 * A resume's summary is very often three bullets, and `inlineRichTextSchema`
 * refuses those — so the choice is between converting them and losing the
 * paragraph every output surface leads with. They become sentences: the marker
 * goes, and a line not already ending in punctuation gains a full stop, because
 * "Led a team of six Shipped the payments rewrite" is worse than either bullet
 * on its own.
 */
function prose(value: string, max: number): string {
  const lines = text(value, max)
    .split(/\r?\n+/)
    .map((entry) => entry.replace(LIST_MARKER, "").replace(/\s+/g, " ").trim())
    .filter((entry) => entry !== "");

  return lines
    .map((entry, index) =>
      index === lines.length - 1 || /[.!?:;]$/.test(entry)
        ? entry
        : `${entry}.`,
    )
    .join(" ")
    .slice(0, max);
}

/** A bullet list: markers stripped, empties dropped, deduplicated. Duplicates
 * happen — a two-column PDF whose text layer repeats a line reads as the user
 * having said the same thing twice. */
function bullets(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const entry = inline(value.replace(LIST_MARKER, ""), 1_000);
    const key = entry.toLowerCase();
    if (entry === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entry);
    if (out.length >= max) {
      break;
    }
  }

  return out;
}

/** A set-valued field (skills, technologies): single-line, deduplicated
 * case-insensitively, first spelling wins. */
function terms(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const entry = inline(value, 60);
    const key = entry.toLowerCase();
    if (entry === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entry);
    if (out.length >= max) {
      break;
    }
  }

  return out;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * A `calendarDateSchema` value, or `undefined`.
 *
 * The prompt asks for `YYYY-MM`; this recovers what a model writes anyway when
 * the page says "Jan 2020 - Present". **It never invents a component it was not
 * given**: a bare year stays a bare year (the schema supports year-only
 * precision precisely so this does not have to guess at January), and anything
 * unreadable becomes absent rather than approximate. A wrong date on a resume is
 * a worse failure than a missing one, because the user will not notice it.
 */
export function calendarDate(value: string): string | undefined {
  const raw = inline(value, 40);
  if (raw === "") {
    return undefined;
  }

  // Already canonical, possibly with a suffix the schema would reject.
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(raw);
  if (iso?.[1] && Number(iso[1]) >= 1900) {
    const candidate = [iso[1], iso[2], iso[3]].filter(Boolean).join("-");
    if (CALENDAR_DATE_PATTERN.test(candidate)) {
      return candidate;
    }
    // A real year with a nonsense month ("2020-13"): keep the year, which is
    // true, rather than dropping a date the resume plainly printed.
    return iso[1];
  }

  // "Jan 2020", "January 2020", "Sept. 2019".
  const named = /^([a-z]+)\.?\s+(\d{4})$/i.exec(raw);
  if (named?.[1] && named[2]) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    return month ? `${named[2]}-${month}` : named[2];
  }

  // "03/2020", "3-2020".
  const numeric = /^(\d{1,2})[/-](\d{4})$/.exec(raw);
  if (numeric?.[1] && numeric[2]) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12
      ? `${numeric[2]}-${String(month).padStart(2, "0")}`
      : numeric[2];
  }

  return undefined;
}

/**
 * An `httpUrlSchema` value, or `undefined`.
 *
 * A resume prints `github.com/someone`, not `https://github.com/someone`, so a
 * bare host gains a scheme — a completion rather than an invention: there is
 * exactly one thing that string can mean, and the alternative is dropping every
 * link on the page. Anything not http(s) afterwards is dropped, which is what
 * keeps `javascript:` and `data:` out of storage (doc 10). `mailto:` is dropped
 * too — an address belongs in `contacts.email`, which is handled separately.
 */
export function httpUrl(value: string): string | undefined {
  const raw = inline(value, 2_048).replace(/[.,;:)\]]+$/, "");
  if (raw === "") {
    return undefined;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    // A scheme plus a host is not yet an address: `https://senior` parses.
    return url.hostname.includes(".") ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** An address, or `undefined`. The section schema's `z.email()` is the real
 * check; this refuses in advance what would fail it, so one bad address in a
 * header cannot cost the whole basics block. */
function emailAddress(value: string): string | undefined {
  const raw = inline(value, 320).replace(/^mailto:/i, "");
  return z.email().safeParse(raw).success ? raw : undefined;
}

/** A link's label, derived from its host when the resume printed none. Naming a
 * link is not inventing content — the destination is the fact — and an
 * unlabelled link cannot be stored at all (`profileLinkSchema` requires one). */
export function linkLabel(label: string, url: string): string {
  const given = inline(label, 80);
  if (given !== "") {
    return given;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const name = host.split(".")[0] ?? host;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Link";
  }
}

/**
 * One section's build: stamp provenance, re-parse, keep or drop.
 *
 * The candidates are plain objects assembled field by field below, and the
 * section's **own schema** is what decides each is an item — the same
 * `SECTION_ITEM_SCHEMAS` lookup `proposal.ts` and `buildProfileView` use, so
 * there is one definition of a valid experience entry rather than three.
 */
function collect<K extends IntakeSectionKey>(
  key: K,
  candidates: readonly Record<string, unknown>[],
  onDrop: () => void,
): SectionItemMap[K][] {
  const schema: z.ZodType<SectionItemMap[K]> = SECTION_ITEM_SCHEMAS[key];
  const items: SectionItemMap[K][] = [];

  for (const candidate of candidates.slice(0, MAX_INTAKE_ITEMS)) {
    const parsed = schema.safeParse({
      id: createItemId(),
      source: "resume",
      ...candidate,
    });
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      onDrop();
    }
  }

  return items;
}

/**
 * Build a Profile from an extraction, and report exactly what landed.
 *
 * Pure but for `createItemId` — the same exception `createSeedProfile` takes.
 * Total: it never throws. An extraction that produced nothing usable yields an
 * empty profile carrying whatever identity we already had, and `counts` /
 * `dropped` say so; a first-run screen has to be able to report "we couldn't
 * read that" without an error path.
 *
 * `identity` is the account we already know about (the OAuth name and email) and
 * it **loses to the document on every field they share**. The resume is what the
 * user chose to present professionally; the Google account is what they signed
 * in with, and the two disagree often enough — a maiden name, a personal
 * address, an initial — that preferring the account would look like the import
 * had ignored the page.
 */
export function buildProfileFromResume(
  extraction: ResumeExtraction,
  identity: SeedIdentity = {},
): ResumeImportResult {
  const empty = createEmptyProfile();
  let dropped = 0;
  const drop = () => {
    dropped += 1;
  };

  const summary = prose(extraction.basics.summary, 2_000);

  const links = extraction.basics.links
    .map((link) => {
      const url = httpUrl(link.url);
      return url
        ? { id: createItemId(), label: linkLabel(link.label, url), url }
        : null;
    })
    .filter((link): link is NonNullable<typeof link> => link !== null)
    .slice(0, 20);

  const sections = {
    ...empty.sections,
    experience: collect(
      "experience",
      extraction.experience.map((item) => ({
        company: inline(item.company, 160),
        role: inline(item.role, 160),
        location: inline(item.location, 160),
        startDate: calendarDate(item.startDate),
        endDate: calendarDate(item.endDate),
        summary: text(item.summary, 4_000),
        highlights: bullets(item.highlights, MAX_INTAKE_BULLETS),
      })),
      drop,
    ),
    projects: collect(
      "projects",
      extraction.projects.map((item) => ({
        name: inline(item.name, 160),
        description: text(item.description, 4_000),
        url: httpUrl(item.url),
        repoUrl: httpUrl(item.repoUrl),
        technologies: terms(item.technologies, 50),
        highlights: bullets(item.highlights, MAX_INTAKE_BULLETS),
      })),
      drop,
    ),
    skills: collect(
      "skills",
      extraction.skills.map((item) => ({
        // A group with no heading is still a group of real skills, and
        // `skillGroupSchema` requires a name — so the fallback is a label, not
        // a guess at what the terms have in common.
        name: inline(item.name, 80) || "Skills",
        skills: terms(item.skills, 50),
      })),
      drop,
    ),
    education: collect(
      "education",
      extraction.education.map((item) => ({
        institution: inline(item.institution, 160),
        degree: inline(item.degree, 120),
        area: inline(item.area, 160),
        location: inline(item.location, 160),
        startDate: calendarDate(item.startDate),
        endDate: calendarDate(item.endDate),
        score: inline(item.score, 60),
        highlights: bullets(item.highlights, MAX_INTAKE_BULLETS),
      })),
      drop,
    ),
    writing: collect(
      "writing",
      extraction.writing.map((item) => ({
        title: inline(item.title, 200),
        publisher: inline(item.publisher, 160),
        url: httpUrl(item.url),
        date: calendarDate(item.date),
      })),
      drop,
    ),
    certifications: collect(
      "certifications",
      extraction.certifications.map((item) => ({
        name: inline(item.name, 200),
        issuer: inline(item.issuer, 160),
        date: calendarDate(item.date),
        url: httpUrl(item.url),
      })),
      drop,
    ),
    awards: collect(
      "awards",
      extraction.awards.map((item) => ({
        title: inline(item.title, 200),
        awarder: inline(item.awarder, 160),
        date: calendarDate(item.date),
        summary: text(item.summary, 4_000),
      })),
      drop,
    ),
    languages: collect(
      "languages",
      extraction.languages.map((item) => ({
        name: inline(item.name, 80),
        fluency: inline(item.fluency, 80),
      })),
      drop,
    ),
  };

  const profile = profileSchema.parse({
    ...empty,
    basics: {
      ...empty.basics,
      name: inline(extraction.basics.name, 120) || (identity.name ?? ""),
      summary,
      location: inline(extraction.basics.location, 120),
      contacts: {
        email: emailAddress(extraction.basics.email) ?? identity.email,
        phone: inline(extraction.basics.phone, 40) || undefined,
        website: httpUrl(extraction.basics.website),
      },
      links,
    },
    sections,
  });

  return {
    profile,
    counts: {
      experience: profile.sections.experience.length,
      education: profile.sections.education.length,
      projects: profile.sections.projects.length,
      // Skills are counted in **terms**, not groups: "3 skills" over a profile
      // holding three groups of eight reads as a bug in the import.
      skills: profile.sections.skills.reduce(
        (total, group) => total + group.skills.length,
        0,
      ),
      writing: profile.sections.writing.length,
      certifications: profile.sections.certifications.length,
      awards: profile.sections.awards.length,
      languages: profile.sections.languages.length,
    },
    dropped,
    hasSummary: summary !== "",
  };
}

/** Whether an import produced anything at all — the difference between "here is
 * what we found" and "we couldn't read that one". A name alone does not count:
 * every OAuth account already has one, so a profile carrying only a name is
 * exactly what a failed extraction looks like. */
export function isEmptyImport(result: ResumeImportResult): boolean {
  return (
    !result.hasSummary &&
    Object.values(result.counts).every((count) => count === 0)
  );
}

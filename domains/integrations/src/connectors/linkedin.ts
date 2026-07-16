import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";
import { csvRecords } from "./csv";

/**
 * LinkedIn export connector (docs/architecture/12-integrations-and-sync.md) —
 * `file` mode, the flagship multi-section import: LinkedIn's official data
 * export ZIP (Settings → Get a copy of your data) parses into `experience`,
 * `education`, `skillGroup`, `certification`, and a suggested `profileBasics`
 * patch. One-shot by declaration (`refreshable: false`) — there is no
 * connection to keep alive and no refresh machinery.
 *
 * V1 file handling (R2 upload is the account-gated path, doc 12): the ZIP is
 * extracted where the user is — `extractLinkedinExportFiles` runs in the
 * browser — and only the handful of CSV texts Resfolio reads are sent and
 * stored as the connection's validated `input`. `fetch` then reads
 * `ctx.input` (no network at all); `normalize` is pure per record.
 */

const CSV_MAX = 512_000;
const csvText = z.string().max(CSV_MAX);

export const linkedinInputSchema = z.object({
  files: z
    .object({
      positions: csvText.optional(),
      education: csvText.optional(),
      skills: csvText.optional(),
      certifications: csvText.optional(),
      profile: csvText.optional(),
    })
    .refine((files) => Object.values(files).some(Boolean), {
      message: "The export contains none of the sections Resfolio imports.",
    }),
});

export type LinkedinInput = z.infer<typeof linkedinInputSchema>;
export type LinkedinFiles = LinkedinInput["files"];

/** The export files this connector reads, by ZIP entry basename. */
const EXPORT_FILES: Record<keyof LinkedinFiles, string> = {
  positions: "positions.csv",
  education: "education.csv",
  skills: "skills.csv",
  certifications: "certifications.csv",
  profile: "profile.csv",
};

/**
 * Pull the CSVs Resfolio reads out of a LinkedIn export ZIP. Pure and
 * environment-agnostic (fflate) — the dashboard runs it **in the browser** so
 * only the relevant CSV text ever leaves the user's machine. Media and every
 * other export file are never even decompressed (`filter`).
 */
export function extractLinkedinExportFiles(bytes: Uint8Array): LinkedinFiles {
  const wanted = new Set(Object.values(EXPORT_FILES));
  const basename = (path: string) =>
    (path.split("/").pop() ?? path).toLowerCase();
  const entries = unzipSync(bytes, {
    filter: (file) => wanted.has(basename(file.name)) && file.size <= CSV_MAX,
  });
  const byName = new Map(
    Object.entries(entries).map(([path, data]) => [basename(path), data]),
  );
  const files: Record<string, string> = {};
  for (const [key, name] of Object.entries(EXPORT_FILES)) {
    const data = byName.get(name);
    if (data) {
      files[key] = strFromU8(data);
    }
  }
  return files as LinkedinFiles;
}

/** One raw item per CSV record — except skills, which aggregate into a single
 * raw (they become one `skillGroup` candidate). */
export type LinkedinRaw =
  | {
      file: "positions" | "education" | "certifications" | "profile";
      record: Record<string, string>;
    }
  | { file: "skills"; skills: string[] };

async function* fetchExport(
  ctx: FetchContext<LinkedinInput>,
): AsyncIterable<LinkedinRaw> {
  const { files } = ctx.input;
  for (const file of ["positions", "education", "certifications"] as const) {
    const text = files[file];
    if (!text) {
      continue;
    }
    for (const record of csvRecords(text)) {
      yield { file, record };
    }
  }
  if (files.skills) {
    const skills = csvRecords(files.skills)
      .map((record) => record["Name"] ?? "")
      .filter((name) => name.length > 0);
    if (skills.length > 0) {
      yield { file: "skills", skills };
    }
  }
  if (files.profile) {
    const [record] = csvRecords(files.profile);
    if (record) {
      yield { file: "profile", record };
    }
  }
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

/** LinkedIn export dates ("Jan 2020", "2020") → calendar dates ("2020-01",
 * "2020"), or undefined when absent/unparseable. */
function toCalendarDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const match = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(trimmed);
  if (match) {
    const month = MONTHS[(match[1] as string).toLowerCase()];
    if (month) {
      return `${match[2]}-${month}`;
    }
  }
  return undefined;
}

/** Export text is hostile input; the profile rich-text schema forbids raw
 * HTML (doc 01/10) — strip anything tag-shaped and collapse whitespace. */
function toPlainText(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function httpUrlOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const protocol = new URL(trimmed).protocol;
    return protocol === "http:" || protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** A stable, human-debuggable external id from a record's identity fields —
 * the dedupe key across re-uploads of the export. */
function externalId(prefix: string, ...parts: string[]): string {
  const slug = parts
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join(":");
  return `${prefix}:${slug || "unknown"}`.slice(0, 256);
}

function normalizePosition(record: Record<string, string>): CandidateItem[] {
  const company = record["Company Name"]?.trim() ?? "";
  const role = record["Title"]?.trim() ?? "";
  if (!company || !role) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "experience",
      externalId: externalId("position", company, role, record["Started On"] ?? ""),
      title: `${role} — ${company}`,
      raw: record,
      payload: {
        company,
        role,
        location: record["Location"] ?? "",
        startDate: toCalendarDate(record["Started On"]),
        endDate: toCalendarDate(record["Finished On"]),
        summary: toPlainText(record["Description"]),
        highlights: [],
      },
    }),
  ];
}

function normalizeEducation(record: Record<string, string>): CandidateItem[] {
  const institution = record["School Name"]?.trim() ?? "";
  if (!institution) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "education",
      externalId: externalId(
        "education",
        institution,
        record["Start Date"] ?? "",
      ),
      title: institution,
      raw: record,
      payload: {
        institution,
        degree: record["Degree Name"] ?? "",
        area: record["Field Of Study"] ?? "",
        startDate: toCalendarDate(record["Start Date"]),
        endDate: toCalendarDate(record["End Date"]),
        summary: toPlainText(record["Notes"]),
        highlights: [],
      },
    }),
  ];
}

function normalizeCertification(
  record: Record<string, string>,
): CandidateItem[] {
  const name = record["Name"]?.trim() ?? "";
  if (!name) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "certification",
      externalId: externalId("certification", name, record["Authority"] ?? ""),
      title: name,
      url: httpUrlOrUndefined(record["Url"]),
      raw: record,
      payload: {
        name,
        issuer: record["Authority"] ?? "",
        date: toCalendarDate(record["Started On"]),
        url: httpUrlOrUndefined(record["Url"]),
      },
    }),
  ];
}

function normalizeSkills(skills: string[]): CandidateItem[] {
  const unique = skills
    .map((name) => name.slice(0, 60))
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 50);
  if (unique.length === 0) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "skillGroup",
      externalId: "skills",
      title: "Skills",
      raw: skills,
      payload: { name: "Skills", skills: unique },
    }),
  ];
}

function normalizeProfile(record: Record<string, string>): CandidateItem[] {
  const name = [record["First Name"], record["Last Name"]]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const headline = toPlainText(record["Headline"]).slice(0, 180);
  const summary = toPlainText(record["Summary"]);
  const location = record["Geo Location"]?.trim() ?? "";
  if (!name && !headline && !summary && !location) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "profileBasics",
      externalId: "profile",
      title: "LinkedIn profile",
      raw: record,
      // Defaulted route already: basics, suggested — always shown, never auto.
      payload: { name, headline, summary, location },
    }),
  ];
}

function normalizeRaw(raw: LinkedinRaw): CandidateItem[] {
  switch (raw.file) {
    case "positions":
      return normalizePosition(raw.record);
    case "education":
      return normalizeEducation(raw.record);
    case "certifications":
      return normalizeCertification(raw.record);
    case "skills":
      return normalizeSkills(raw.skills);
    case "profile":
      return normalizeProfile(raw.record);
  }
}

export const linkedin = defineConnector<LinkedinInput, LinkedinRaw>({
  id: "linkedin",
  name: "LinkedIn export",
  authMode: "file",
  tier: "C",
  input: linkedinInputSchema,
  resources: [
    "experience",
    "education",
    "skillGroup",
    "certification",
    "profileBasics",
  ],
  capabilities: { refreshable: false, incremental: false },
  fetch: fetchExport,
  normalize: normalizeRaw,
});

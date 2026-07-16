import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { FetchContext } from "../contract";
import { parseCsv, csvRecords } from "./csv";
import {
  extractLinkedinExportFiles,
  linkedin,
  type LinkedinInput,
  type LinkedinRaw,
} from "./linkedin";
import {
  certificationsCsv,
  educationCsv,
  positionsCsv,
  profileCsv,
  skillsCsv,
} from "./linkedin.fixtures";

function makeCtx(files: LinkedinInput["files"]): FetchContext<LinkedinInput> {
  return {
    input: { files },
    cursor: undefined,
    setCursor: () => {},
    // File connectors never touch the network — a fetch that throws proves it.
    fetch: (() => {
      throw new Error("file connectors must not fetch");
    }) as unknown as typeof fetch,
  };
}

async function collect(iter: AsyncIterable<LinkedinRaw>): Promise<LinkedinRaw[]> {
  const out: LinkedinRaw[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("parseCsv", () => {
  it("handles quoted fields with commas, newlines, and escaped quotes", () => {
    const rows = parseCsv(positionsCsv);
    expect(rows[0]).toEqual([
      "Company Name",
      "Title",
      "Description",
      "Location",
      "Started On",
      "Finished On",
    ]);
    const first = rows[1]!;
    expect(first[0]).toBe("Meridian Labs");
    expect(first[2]).toContain("Shipped the billing rewrite");
    expect(first[2]).toContain("\n");
    expect(first[3]).toBe("Berlin, Germany");
    const second = rows[2]!;
    expect(second[2]).toBe('Built the "atlas" ingestion service.');
  });

  it("strips a BOM and skips blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvRecords", () => {
  it("keys records by trimmed header names", () => {
    const records = csvRecords(educationCsv);
    expect(records).toHaveLength(1);
    expect(records[0]!["School Name"]).toBe("Technical University of Munich");
    expect(records[0]!["Degree Name"]).toBe("BSc Computer Science");
  });
});

describe("linkedin.fetch", () => {
  it("yields per-record raws, aggregates skills, never touches the network", async () => {
    const raws = await collect(
      linkedin.fetch(
        makeCtx({
          positions: positionsCsv,
          education: educationCsv,
          skills: skillsCsv,
          certifications: certificationsCsv,
          profile: profileCsv,
        }),
      ),
    );
    const byFile = raws.map((raw) => raw.file);
    // 3 position rows + 1 education + 2 certifications + 1 skills + 1 profile
    expect(byFile.filter((f) => f === "positions")).toHaveLength(3);
    expect(byFile.filter((f) => f === "skills")).toHaveLength(1);
    const skills = raws.find((raw) => raw.file === "skills");
    if (skills?.file === "skills") {
      expect(skills.skills).toContain("TypeScript");
    }
  });

  it("skips absent files", async () => {
    const raws = await collect(linkedin.fetch(makeCtx({ skills: skillsCsv })));
    expect(raws).toHaveLength(1);
  });
});

describe("linkedin.normalize — the multi-section mapping", () => {
  it("positions → experience with LinkedIn dates as calendar dates", () => {
    const records = csvRecords(positionsCsv);
    const [candidate] = linkedin.normalize({
      file: "positions",
      record: records[0]!,
    });
    expect(candidate?.kind).toBe("experience");
    expect(candidate?.externalId).toBe(
      "position:meridian-labs:senior-software-engineer:mar-2021",
    );
    if (candidate?.kind === "experience") {
      expect(candidate.payload.company).toBe("Meridian Labs");
      expect(candidate.payload.role).toBe("Senior Software Engineer");
      expect(candidate.payload.startDate).toBe("2021-03");
      expect(candidate.payload.endDate).toBeUndefined();
      expect(candidate.payload.summary).toContain("billing rewrite");
    }
  });

  it("skips a position with no company", () => {
    const records = csvRecords(positionsCsv);
    expect(
      linkedin.normalize({ file: "positions", record: records[2]! }),
    ).toEqual([]);
  });

  it("education → education with year-precision dates", () => {
    const [record] = csvRecords(educationCsv);
    const [candidate] = linkedin.normalize({
      file: "education",
      record: record!,
    });
    if (candidate?.kind === "education") {
      expect(candidate.payload.institution).toBe(
        "Technical University of Munich",
      );
      expect(candidate.payload.degree).toBe("BSc Computer Science");
      expect(candidate.payload.startDate).toBe("2014");
      expect(candidate.payload.endDate).toBe("2018");
    }
  });

  it("skills → one deduplicated skillGroup", () => {
    const [candidate] = linkedin.normalize({
      file: "skills",
      skills: ["TypeScript", "PostgreSQL", "TypeScript"],
    });
    expect(candidate?.kind).toBe("skillGroup");
    if (candidate?.kind === "skillGroup") {
      expect(candidate.payload.skills).toEqual(["TypeScript", "PostgreSQL"]);
    }
  });

  it("certifications → certification; an unsafe URL is dropped, not stored", () => {
    const records = csvRecords(certificationsCsv);
    const [safe] = linkedin.normalize({
      file: "certifications",
      record: records[0]!,
    });
    if (safe?.kind === "certification") {
      expect(safe.payload.issuer).toBe("Amazon Web Services");
      expect(safe.payload.date).toBe("2023-05");
      expect(safe.payload.url).toBe("https://www.credly.com/badges/abc");
    }
    const [unsafe] = linkedin.normalize({
      file: "certifications",
      record: records[1]!,
    });
    if (unsafe?.kind === "certification") {
      expect(unsafe.payload.url).toBeUndefined();
      expect(unsafe.url).toBeUndefined();
    }
  });

  it("profile → a suggested basics patch with HTML stripped", () => {
    const [record] = csvRecords(profileCsv);
    const [candidate] = linkedin.normalize({ file: "profile", record: record! });
    expect(candidate?.kind).toBe("profileBasics");
    if (candidate?.kind === "profileBasics") {
      expect(candidate.payload.name).toBe("Ada Lovelace");
      expect(candidate.payload.headline).toBe("Platform engineer at heart");
      expect(candidate.payload.location).toBe("Berlin, Germany");
    }
  });
});

describe("extractLinkedinExportFiles", () => {
  it("pulls only the CSVs Resfolio reads out of the export ZIP", () => {
    const zip = zipSync({
      "Basic_LinkedInDataExport/Positions.csv": strToU8(positionsCsv),
      "Basic_LinkedInDataExport/Skills.csv": strToU8(skillsCsv),
      "Basic_LinkedInDataExport/Connections.csv": strToU8("First Name\nBob\n"),
      "media/photo.jpg": new Uint8Array([0xff, 0xd8]),
    });
    const files = extractLinkedinExportFiles(zip);
    expect(files.positions).toContain("Meridian Labs");
    expect(files.skills).toContain("TypeScript");
    expect(files.education).toBeUndefined();
    expect(files.certifications).toBeUndefined();
    // Connections.csv (other people's data) is never extracted.
    expect(Object.values(files).join("")).not.toContain("Bob");
  });

  it("the extracted files round-trip through the connector's input schema", async () => {
    const zip = zipSync({ "Skills.csv": strToU8(skillsCsv) });
    const files = extractLinkedinExportFiles(zip);
    const parsed = linkedin.input!.safeParse({ files });
    expect(parsed.success).toBe(true);
    const raws = await collect(linkedin.fetch(makeCtx(files)));
    const candidates = raws.flatMap((raw) => linkedin.normalize(raw));
    expect(candidates.map((c) => c.kind)).toEqual(["skillGroup"]);
  });
});

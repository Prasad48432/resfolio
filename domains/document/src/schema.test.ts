import { describe, expect, it } from "vitest";

import {
  newResumeDocumentInput,
  updateDocumentSchema,
} from "./schema";

describe("newResumeDocumentInput", () => {
  it("defaults kind to resume, identity view, and carries the template config", () => {
    const input = newResumeDocumentInput({
      name: "Backend Resume",
      templateId: "resume-classic",
      templateMajor: 1,
      config: { pageSize: "A4", accent: "#f0592b" },
    });

    expect(input).toEqual({
      name: "Backend Resume",
      kind: "resume",
      templateId: "resume-classic",
      templateMajor: 1,
      config: { pageSize: "A4", accent: "#f0592b" },
      view: {},
    });
  });
});

describe("updateDocumentSchema", () => {
  it("accepts a partial patch and trims the name", () => {
    const parsed = updateDocumentSchema.parse({ name: "  Renamed  " });
    expect(parsed).toEqual({ name: "Renamed" });
  });

  it("rejects an empty name and a non-positive template major", () => {
    expect(updateDocumentSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      updateDocumentSchema.safeParse({ templateMajor: 0 }).success,
    ).toBe(false);
  });

  it("validates an embedded view definition", () => {
    const ok = updateDocumentSchema.safeParse({
      view: { sectionOrder: ["experience", "education"] },
    });
    expect(ok.success).toBe(true);
    const bad = updateDocumentSchema.safeParse({
      view: { sectionOrder: ["not-a-section"] },
    });
    expect(bad.success).toBe(false);
  });
});

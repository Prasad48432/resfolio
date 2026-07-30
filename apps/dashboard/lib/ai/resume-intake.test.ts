import { describe, expect, it } from "vitest";

import { MAX_RESUME_BYTES } from "./limits";
import {
  isPdfBytes,
  parseResumeUpload,
  RESUME_MIME_TYPE,
} from "./resume-intake";

function pdf(bytes = 1_000, type = RESUME_MIME_TYPE): File {
  return new File([new Uint8Array(bytes)], "resume.pdf", { type });
}

describe("parseResumeUpload", () => {
  it("accepts a PDF within the ceiling", () => {
    const result = parseResumeUpload(pdf());
    expect(result.ok).toBe(true);
  });

  it("refuses a missing file with a 400", () => {
    expect(parseResumeUpload(null)).toMatchObject({
      ok: false,
      problem: { status: 400 },
    });
    expect(parseResumeUpload("resume.pdf")).toMatchObject({
      ok: false,
      problem: { status: 400 },
    });
  });

  it("refuses an empty file", () => {
    const result = parseResumeUpload(pdf(0));
    expect(result).toMatchObject({ ok: false, problem: { status: 400 } });
  });

  it("refuses an oversized file with a 413, and names the limit", () => {
    const result = parseResumeUpload(pdf(MAX_RESUME_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.status).toBe(413);
      expect(result.problem.message).toContain("8MB");
    }
  });

  it("checks size before type — the message must name what the user can see", () => {
    const result = parseResumeUpload(
      pdf(MAX_RESUME_BYTES + 1, "application/msword"),
    );
    expect(result).toMatchObject({ ok: false, problem: { status: 413 } });
  });

  it("refuses a declared non-PDF with a 415", () => {
    const result = parseResumeUpload(pdf(1_000, "application/msword"));
    expect(result).toMatchObject({ ok: false, problem: { status: 415 } });
  });

  it("lets an empty declared type through to the byte check", () => {
    // Some browsers send nothing for a dragged file; refusing those would break
    // drag-and-drop for a check `isPdfBytes` makes properly.
    expect(parseResumeUpload(pdf(1_000, "")).ok).toBe(true);
  });
});

describe("isPdfBytes", () => {
  it("accepts the %PDF- header", () => {
    expect(isPdfBytes(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
  });

  it("refuses anything else, whatever it was called", () => {
    // The case the declared type cannot catch: a renamed file.
    expect(isPdfBytes(new TextEncoder().encode("PK"))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode("<html>"))).toBe(false);
  });

  it("refuses a file shorter than the header", () => {
    expect(isPdfBytes(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

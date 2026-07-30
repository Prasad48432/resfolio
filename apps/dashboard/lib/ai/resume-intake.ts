import { MAX_RESUME_BYTES } from "./limits";

/**
 * The resume-upload boundary (docs/architecture/16-onboarding.md).
 *
 * Pure — no SDK, no env, no I/O — so every refusal the user can see is
 * unit-testable without a model or a file system. The prompt lives in
 * `system-prompt.ts` with the others, and the extraction *shape* lives in
 * `@resfolio/profile` (`intake.ts`), because it is profile knowledge rather than
 * model knowledge: it validates against the profile's own schemas.
 *
 * Everything here exists because **the file is the least trustworthy input this
 * product accepts**, and the two obvious checks — `file.type` and the extension —
 * are both attacker-supplied strings.
 */

/** The declared type a browser sends for a PDF. Checked early because it is
 * cheap and stops the ordinary mistake (someone picking their .docx), but it is
 * a *hint* — {@link isPdfBytes} is the check that counts. */
export const RESUME_MIME_TYPE = "application/pdf";

/** What the file input advertises. Both, because Safari has historically sent an
 * empty `type` for a drag-and-dropped file and matched only on extension. */
export const RESUME_ACCEPT = ".pdf,application/pdf";

/**
 * The PDF header, as bytes: `%PDF-`.
 *
 * **This is the real type check, and it has to read the file.** A browser's
 * `File.type` comes from the OS's extension mapping and is trivially wrong or
 * forged; the bytes are the document. Same posture as the image upload route,
 * which re-encodes rather than trusting `file.type` (doc 07) — we cannot
 * re-encode a PDF, so verifying the magic number is what is left.
 *
 * It is deliberately not a full validation. A file that starts `%PDF-` and is
 * corrupt afterwards is the provider's problem to report, and it reports it as a
 * failed extraction, which is a message this flow already has to be able to
 * show.
 */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function isPdfBytes(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Why an upload was refused, in the words the user is shown. `status` is what
 * the route answers with — the copy and the code are decided together so a limit
 * can never be explained one way and enforced another (the lesson from
 * `MAX_CHARS_PER_MESSAGE`). */
export interface ResumeUploadProblem {
  status: 400 | 413 | 415;
  message: string;
}

export type ResumeUploadResult =
  | { ok: true; file: File }
  | { ok: false; problem: ResumeUploadProblem };

/**
 * Check a multipart `file` field before anything reads it.
 *
 * Ordered cheapest-first, like every guard ladder in this feature: shape, then
 * size, then declared type. Size before type on purpose — an 80MB file should be
 * refused for being 80MB whatever it claims to be, and the message a user acts on
 * is the one about the file they can see.
 */
export function parseResumeUpload(value: unknown): ResumeUploadResult {
  if (!(value instanceof File)) {
    return {
      ok: false,
      problem: { status: 400, message: "Choose a PDF resume to upload." },
    };
  }

  if (value.size === 0) {
    return {
      ok: false,
      problem: { status: 400, message: "That file is empty." },
    };
  }

  if (value.size > MAX_RESUME_BYTES) {
    const mb = Math.round(MAX_RESUME_BYTES / (1024 * 1024));
    return {
      ok: false,
      problem: {
        status: 413,
        message: `That file is too large — the limit is ${mb}MB. A one or two page resume is usually well under 1MB.`,
      },
    };
  }

  // An empty `type` is allowed through to the byte check: some browsers send
  // nothing for a dragged file, and refusing those would break drag-and-drop for
  // a check the bytes make properly a moment later.
  if (value.type !== "" && value.type !== RESUME_MIME_TYPE) {
    return {
      ok: false,
      problem: {
        status: 415,
        message:
          "Upload a PDF. Word documents and images aren't supported yet.",
      },
    };
  }

  return { ok: true, file: value };
}

/** The refusal for a file that is not actually a PDF, wherever it came from.
 * Shared so the byte check and the declared-type check say the same thing. */
export const NOT_A_PDF: ResumeUploadProblem = {
  status: 415,
  message:
    "That doesn't look like a PDF. Export your resume as a PDF and try again.",
};

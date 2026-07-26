import { env } from "@/lib/env";

/**
 * A resume's permanent public URL (docs/architecture/02-resume-rendering.md).
 *
 * No token, no expiry, no minting: the document id *is* the URL, and the row's
 * own `visibility` decides who may read it. This is only env-gated because the
 * dashboard needs to know where `apps/sites` is deployed — absent `SITES_URL`,
 * the UI hides the link rather than showing a broken one.
 */
export function resumePublicUrl(documentId: string): string | null {
  const sitesUrl = env.SITES_URL;
  if (!sitesUrl) {
    return null;
  }
  return `${sitesUrl.replace(/\/$/, "")}/render/resume/${encodeURIComponent(documentId)}`;
}

/** Whether this environment can produce a PDF: the feature must not be switched
 * off (`PDF_EXPORT_ENABLED=false`), and the sites origin + server-to-server
 * secret must be present. Absent or off, the Download button hides — and the
 * route refuses too (see the pdf route), so hiding the button is never the only
 * guard. */
export function resumeExportEnabled(): boolean {
  if (env.PDF_EXPORT_ENABLED === "false") {
    return false;
  }
  return Boolean(env.SITES_URL && env.RENDER_SECRET);
}

/** `Senior Engineer Resume` → `senior-engineer-resume.pdf` */
export function resumeFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "resume"}.pdf`;
}

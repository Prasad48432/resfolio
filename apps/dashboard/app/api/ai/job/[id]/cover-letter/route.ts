import { requireSession } from "@resfolio/auth";
import { getJobMatch } from "@resfolio/job/server";
import { createLogger } from "@resfolio/observability";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { NextResponse } from "next/server";

import { coverLetterFilename } from "@/lib/ai/cover-letter";
import { renderCoverLetterPdf } from "@/lib/pdf/cover-letter-pdf";

/**
 * Download a saved cover letter as PDF
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **A route handler, and it is the same exception `GET /api/resumes/[id]/pdf`
 * takes**: the product need is a real browser download with a filename, which
 * means `Content-Disposition`, which a Server Action cannot return. It is not a
 * fourth *AI* route — nothing here calls a model. The letter was written by
 * `/api/ai/cover-letter` and stored by a Server Action; this draws the stored
 * one.
 *
 * **Nothing about it is streamed and nothing about it is slow.** The résumé
 * export exists on the far side of `RENDER_SECRET` and a Fly-hosted Chromium
 * because a résumé is an arbitrary template; a letter is one fixed layout drawn
 * by `pdf-lib` in this process, in milliseconds. So this route needs no
 * `maxDuration`, no bearer hop, and no kill switch tied to `PDF_EXPORT_ENABLED`
 * — a letter keeps downloading in an environment where résumé export is turned
 * off, because it costs nothing to serve.
 *
 * **Ownership is the whole guard.** `getJobMatch` is user-scoped, so a job id
 * belonging to someone else resolves to nothing and answers 404 — the same
 * answer a deleted job gives, deliberately, because distinguishing them would
 * report that another account has that id.
 */
export const dynamic = "force-dynamic";

const log = createLogger("dashboard:cover-letter-pdf");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requireSession();
  const { id } = await params;

  const job = await getJobMatch(session.user.id, id);

  // Not found and not yours are one answer on purpose.
  if (!job) {
    return NextResponse.json({ error: "No such job." }, { status: 404 });
  }

  if (!job.coverLetter) {
    return NextResponse.json(
      { error: "There's no cover letter saved for this job yet." },
      { status: 404 },
    );
  }

  // The signature and contact line come from the profile, never from the letter
  // — the model has no field for either, so a name it invented has nowhere to
  // live and the user's own cannot be misspelled.
  const draft = await getOrCreateProfile(session.user.id);
  const { basics } = draft.data;

  let bytes: Uint8Array;
  try {
    bytes = await renderCoverLetterPdf({
      letter: job.coverLetter,
      signature: basics.name,
      email: basics.contacts.email,
      phone: basics.contacts.phone,
      location: basics.location,
      role: job.role,
      company: job.company,
    });
  } catch (error) {
    log.error(
      { err: error, userId: session.user.id, jobId: id },
      "cover letter pdf failed",
    );
    return NextResponse.json(
      { error: "That letter couldn't be turned into a PDF." },
      { status: 500 },
    );
  }

  const filename = coverLetterFilename(job.company ?? "", job.role ?? "");

  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      // The reason this is a route at all.
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(bytes.byteLength),
      // A letter is per-user content behind a session; nothing may cache it.
      "cache-control": "private, no-store",
    },
  });
}

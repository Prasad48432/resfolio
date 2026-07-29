import { requireSession } from "@resfolio/auth";
import { coverLetterSchema, type CoverLetterContent } from "@resfolio/job";
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
 * **Nothing about it is streamed and nothing about it is slow.** The resume
 * export exists on the far side of `RENDER_SECRET` and a Fly-hosted Chromium
 * because a resume is an arbitrary template; a letter is one fixed layout drawn
 * by `pdf-lib` in this process, in milliseconds. So this route needs no
 * `maxDuration`, no bearer hop, and no kill switch tied to `PDF_EXPORT_ENABLED`
 * — a letter keeps downloading in an environment where resume export is turned
 * off, because it costs nothing to serve.
 *
 * **Ownership is the whole guard.** `getJobMatch` is user-scoped, so a job id
 * belonging to someone else resolves to nothing and answers 404 — the same
 * answer a deleted job gives, deliberately, because distinguishing them would
 * report that another account has that id.
 *
 * **Two verbs, because there are two moments someone wants this file.**
 * `GET` draws the letter this job has *stored* — the panel's button, and the one
 * that still works when the conversation is reopened next week. `POST` draws the
 * letter in the request body: the one on screen, the instant the last sentence
 * lands.
 *
 * That second verb is not a convenience. The letter reaches the database through
 * a Server Action fired from `onFinish`, and the panel only learns about it on
 * its next read — so a `GET`-only route means the *download* of a letter someone
 * is looking at depends on a write and a refresh they cannot see, and any hitch
 * in either leaves a finished letter on screen with no way to get it out. The
 * bytes should depend on the letter, not on the bookkeeping around it. `POST`
 * still resolves the job (ownership, and the company name for the filename) and
 * still takes the signature from the profile; only the prose comes from the
 * body, and it re-parses through the domain's own `coverLetterSchema` on arrival.
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

  return draw(session.user.id, id, job.coverLetter, job.role, job.company);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requireSession();
  const { id } = await params;

  const job = await getJobMatch(session.user.id, id);
  if (!job) {
    return NextResponse.json({ error: "No such job." }, { status: 404 });
  }

  // The domain's own schema, not a second copy of it: what is drawn here and
  // what is stored on the row are the same shape, checked by the same code.
  const parsed = coverLetterSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That letter isn't in a shape we can draw." },
      { status: 400 },
    );
  }

  return draw(session.user.id, id, parsed.data, job.role, job.company);
}

/** Embed, draw, and answer with a download. Shared so the stored letter and the
 * on-screen one cannot produce different files. */
async function draw(
  userId: string,
  jobId: string,
  letter: CoverLetterContent,
  role: string | null,
  company: string | null,
): Promise<Response> {
  // The signature and contact line come from the profile, never from the letter
  // — the model has no field for either, so a name it invented has nowhere to
  // live and the user's own cannot be misspelled.
  const draft = await getOrCreateProfile(userId);
  const { basics } = draft.data;

  let bytes: Uint8Array;
  try {
    bytes = await renderCoverLetterPdf({
      letter,
      signature: basics.name,
      email: basics.contacts.email,
      phone: basics.contacts.phone,
      location: basics.location,
      role,
      company,
    });
  } catch (error) {
    log.error({ err: error, userId, jobId }, "cover letter pdf failed");
    return NextResponse.json(
      { error: "That letter couldn't be turned into a PDF." },
      { status: 500 },
    );
  }

  const filename = coverLetterFilename(company ?? "", role ?? "");

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

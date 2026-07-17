import { requireSession } from "@resfolio/auth";
import { DocumentNotFoundError } from "@resfolio/document";
import { getDocument } from "@resfolio/document/server";
import { createLogger } from "@resfolio/observability";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { resumeFilename } from "@/lib/resume-url";

/**
 * Download a resume as a PDF (docs/architecture/02-resume-rendering.md).
 *
 * A route handler rather than a Server Action because the product need is a
 * real browser download — an `<a download>` the browser streams to disk — and
 * an action can only return serialisable data.
 *
 * **This is where ownership is enforced.** `apps/sites` has no sessions, so the
 * trust boundary sits here: verify the session, verify the session owns the
 * document (`getDocument` is user-scoped and throws otherwise), and only then
 * call the render host with the server-to-server secret. The user never sees or
 * holds that secret, which is what lets a *private* resume still be downloaded
 * by the person who owns it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("dashboard:resume-pdf");

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await requireSession();
  const { id } = await params;

  const sitesUrl = env.SITES_URL;
  const secret = env.RENDER_SECRET;
  if (!sitesUrl || !secret) {
    return NextResponse.json(
      { error: "PDF export isn't configured in this environment." },
      { status: 501 },
    );
  }

  // User-scoped: someone else's id throws, so this is the ownership check.
  let document;
  try {
    document = await getDocument(session.user.id, id);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    throw error;
  }

  const response = await fetch(
    `${sitesUrl.replace(/\/$/, "")}/api/export/resume/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const reason = await response.text().catch(() => "");
    log.error(
      { documentId: id, status: response.status, reason },
      "resume pdf export failed",
    );
    if (response.status === 501) {
      return NextResponse.json(
        { error: "PDF export isn't available in this environment yet." },
        { status: 501 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't generate that PDF. Please try again." },
      { status: 502 },
    );
  }

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${resumeFilename(document.name)}"`,
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store",
    },
  });
}

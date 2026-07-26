import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { LocalFsExportStore } from "@/lib/export-store";
import {
  PdfEngineUnavailableError,
  PdfRenderError,
  renderPdf,
} from "@/lib/pdf";
import { renderKey } from "@/lib/render-key";
import { resolveResumeRender } from "@/lib/resolve";
import { getResumeTemplate } from "@/lib/templates";

/**
 * Resume → PDF (docs/architecture/02-resume-rendering.md § "Where PDFs are
 * generated", 09-rendering-pipeline.md § Deliver). Productizes the local spike:
 * content-hash the render, check the `ExportStore` (hit → no Chromium boot),
 * else drive Playwright over the app's own render route and store the result.
 *
 * **Server-to-server**, bearer-guarded with `RENDER_SECRET` — this app has no
 * sessions, so the dashboard verifies the caller owns the document and then
 * calls here. No user-facing token is involved anywhere; that is what lets a
 * *private* resume still be exported by its owner.
 *
 * Renders the owner's **draft**, matching the editor preview the Download
 * button sits beside. The public URL renders the published version; the two
 * differing while a profile has unpublished edits is the same publish model
 * portfolios already use, not a bug.
 *
 * Doc 02 puts real PDF generation in a Trigger.dev task, not a serverless
 * route. This route is that task's body, reachable today: `lib/pdf.ts` imports
 * Playwright dynamically, so a deployment without it answers 501 rather than
 * shipping ~50MB of Chromium. Wrapping this in the task and swapping
 * `LocalFsExportStore` for R2 is the remaining cloud work.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  if (request.headers.get("authorization") !== `Bearer ${env.RENDER_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { documentId } = await params;

  const result = await resolveResumeRender(documentId, "draft");
  if (result.status !== "ok") {
    return NextResponse.json(
      { ok: false, reason: result.status },
      { status: result.status === "not-found" ? 404 : 409 },
    );
  }

  const template = getResumeTemplate(result.inputs.templateId);
  if (!template) {
    return NextResponse.json(
      { ok: false, reason: "unknown-template" },
      { status: 404 },
    );
  }

  const key = renderKey(
    {
      revision: result.inputs.revision,
      templateId: result.inputs.templateId,
      config: result.inputs.config,
      view: result.inputs.viewDefinition,
    },
    template.version,
  );

  const origin = new URL(request.url).origin;
  // On Vercel the deployment filesystem is read-only except the OS temp dir, so
  // the content-addressed cache must live under `/tmp` (ephemeral per warm
  // instance, which is fine — a cold instance simply re-renders). Locally it
  // stays `./out`, matching the `export:pdf` script. Both go away once the
  // `R2ExportStore` lands behind this same seam (doc 07).
  const store = new LocalFsExportStore(
    env.VERCEL
      ? join(tmpdir(), "resfolio-exports")
      : join(process.cwd(), "out"),
  );

  // Engine selection, most-capable first: the dedicated Fly service (works on
  // any host, incl. Vercel Hobby's 1 GB limit) → in-function serverless Chromium
  // (Vercel Pro) → the full local browser (dev/CI).
  const service =
    env.PDF_SERVICE_URL && env.PDF_SERVICE_SECRET
      ? { url: env.PDF_SERVICE_URL, secret: env.PDF_SERVICE_SECRET }
      : undefined;
  const engine = service ? "remote" : env.VERCEL ? "serverless" : "local";

  try {
    const { bytes, cached } = await renderPdf({
      key,
      url: `${origin}/render/resume/${encodeURIComponent(documentId)}/draft`,
      headers: { authorization: `Bearer ${env.RENDER_SECRET}` },
      store,
      engine,
      service,
    });
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
        "x-render-key": key,
        "x-render-cache": cached ? "hit" : "miss",
      },
    });
  } catch (error) {
    if (error instanceof PdfEngineUnavailableError) {
      return NextResponse.json(
        { ok: false, reason: "pdf-engine-unavailable" },
        { status: 501 },
      );
    }
    if (error instanceof PdfRenderError) {
      return NextResponse.json(
        { ok: false, reason: "render-failed" },
        { status: 502 },
      );
    }
    throw error;
  }
}

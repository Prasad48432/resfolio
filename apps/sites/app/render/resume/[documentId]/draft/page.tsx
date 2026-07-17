import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { env } from "@/lib/env";
import {
  renderResumeDocument,
  UnrenderableDocumentError,
} from "@/lib/render-resume";
import { resolveResumeRender } from "@/lib/resolve";

/**
 * The **private draft render** of a resume (docs/architecture/02-resume-
 * rendering.md, 09-rendering-pipeline.md). Same Resolve → Project → Render as
 * the public route, over the owner's working **draft** instead of their
 * published version.
 *
 * Why this exists: the owner's own PDF must match the editor preview beside
 * it, and the preview shows the draft. Exporting the published version instead
 * would mean a brand-new user — profile filled in, nothing published yet —
 * clicks Download PDF and gets told to go publish first. The public URL still
 * only ever shows the published version; this is the owner's private view of
 * their own work.
 *
 * Guarded by the **server-to-server** `RENDER_SECRET` bearer, not a user
 * session (this app has no auth) and not a user-facing token. Only the
 * dashboard's export route reaches it, and only after it has verified the
 * session owns the document. `force-dynamic` + never cached: a draft changes
 * on every keystroke, and ISR-caching someone's unpublished writing would be
 * exactly the leak this design avoids.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

interface DraftPageProps {
  params: Promise<{ documentId: string }>;
}

export default async function ResumeDraftPage({ params }: DraftPageProps) {
  const auth = (await headers()).get("authorization");
  if (auth !== `Bearer ${env.RENDER_SECRET}`) {
    // 404, not 401: an unauthenticated caller learns nothing about whether the
    // id exists.
    notFound();
  }

  const { documentId } = await params;
  const result = await resolveResumeRender(documentId, "draft");
  if (result.status !== "ok") {
    notFound();
  }

  try {
    return renderResumeDocument(result.inputs);
  } catch (error) {
    if (error instanceof UnrenderableDocumentError) {
      notFound();
    }
    throw error;
  }
}

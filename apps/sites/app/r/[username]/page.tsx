import { notFound } from "next/navigation";

import {
  renderResumeDocument,
  UnrenderableDocumentError,
} from "@/lib/render-resume";
import { resolveResumeByHandle } from "@/lib/resolve";

/**
 * The **pretty public resume route** (`/r/<username>`), the resume counterpart
 * to the portfolio's `/p/<username>` (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md). It resolves the profile's public **handle** to a
 * resume document, then runs the exact same Resolve → Project → Render as
 * `/render/resume/[documentId]` — same component, same fonts, so preview, page
 * and PDF stay pixel-identical.
 *
 * Which resume shows: the one the owner pinned (`profiles.public_resume_id`),
 * else their sole resume, else 404. The document's own `visibility` still
 * decides the outcome, so a private selection renders the "this resume is
 * private" notice rather than leaking existence via a 404.
 *
 * Same posture as the id route: **no token** (the handle is the capability),
 * **not cached** (the render depends on live `config`/`view`/`visibility`), and
 * **not indexable** (a resume carries contact details and has no `discoverable`
 * opt-in). See the id route for the full rationale.
 */
export const dynamic = "force-dynamic";

interface ResumeRouteProps {
  params: Promise<{ username: string }>;
}

/** Public but deliberately **not indexable** — see the id route. `X-Robots-Tag`
 * in `next.config.ts` is the authoritative signal; this is belt-and-suspenders. */
export async function generateMetadata({ params }: ResumeRouteProps) {
  const { username } = await params;
  const result = await resolveResumeByHandle(username);
  const robots = { index: false, follow: false };
  if (result.status !== "ok") {
    return { title: "Resume", robots };
  }
  const name = result.inputs.view.basics.name?.trim();
  return { title: name ? `${name} — Resume` : "Resume", robots };
}

export default async function ResumeByHandlePage({ params }: ResumeRouteProps) {
  const { username } = await params;
  const result = await resolveResumeByHandle(username);

  if (result.status === "not-found") {
    notFound();
  }
  if (result.status === "private") {
    return <ResumeNotice title="This resume is private." />;
  }
  if (result.status === "unpublished") {
    return (
      <ResumeNotice
        title="This resume isn’t published yet."
        detail="Its owner needs to publish their profile before it can be shared."
      />
    );
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

/** The non-render outcomes. Deliberately plain: this page is served from the
 * render host, which carries no marketing theme (its `globals.css` is a reset),
 * so it styles itself inline rather than reaching for tokens it doesn't have.
 * Mirrors the id route's notice. */
function ResumeNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
        color: "#262019",
      }}
    >
      <div>
        <p style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
          {title}
        </p>
        {detail ? (
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#6f6455",
            }}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

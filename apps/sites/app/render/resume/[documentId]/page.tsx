import { notFound } from "next/navigation";

import {
  renderResumeDocument,
  UnrenderableDocumentError,
} from "@/lib/render-resume";
import { resolveResumeRender } from "@/lib/resolve";

/**
 * The **public resume route** (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md): Server Component, zero client JS. Runs
 * Resolve → Project → Render — the same component and the same self-hosted
 * fonts Playwright loads at export and the dashboard renders in preview, so
 * all three are pixel-identical.
 *
 * **No token.** A resume URL is permanent and unauthenticated; the document
 * row's own `visibility` is the access decision. Private renders a plain "this
 * resume is private" page rather than a 404 — the URL genuinely exists, and
 * 404-ing would leak the difference between "no such resume" and "not yours"
 * to anyone probing ids.
 *
 * It always projects the owner's **published** profile version, never the
 * draft, so editing a profile can never publish half a thought.
 *
 * **Not cached, deliberately.** A published version is immutable, so ISR looks
 * free here — but the *render* isn't identified by the version alone. It also
 * depends on the document's `config`, `view` and `visibility`, all of which are
 * live and autosaved. So the page has two independent invalidation triggers
 * (publish, and any edit in the resume editor), and a cache would need both
 * wired through `/api/revalidate` — which today only knows about `site:<id>`.
 * Caching this before that plumbing exists means shipping a resume that shows
 * yesterday's content, or a private one that stays readable after being made
 * private. A resume is a link shared with a handful of people, not the SEO
 * surface a portfolio is; the read is one query plus a pure projection.
 * Correctness first — ISR + `document:<id>` tags are a fine optimization once
 * publish and the editor both drop them.
 */
export const dynamic = "force-dynamic";

interface ResumePageProps {
  params: Promise<{ documentId: string }>;
}

/**
 * Public, but deliberately **not indexable**. "Public" here means anyone with
 * the link can read it without signing in — which is how a resume is actually
 * shared. It is not an invitation for Google to publish someone's phone number
 * and email against their name. Portfolios earn indexing through an explicit
 * `discoverable` toggle (doc 04); a resume has no such toggle, so the
 * conservative default is the only honest one. `X-Robots-Tag` in
 * `next.config.ts` is the authoritative signal; this is belt-and-suspenders.
 */
export async function generateMetadata({ params }: ResumePageProps) {
  const { documentId } = await params;
  const result = await resolveResumeRender(documentId, "published");
  const robots = { index: false, follow: false };
  if (result.status !== "ok") {
    return { title: "Resume", robots };
  }
  const name = result.inputs.view.basics.name?.trim();
  return { title: name ? `${name} — Resume` : "Resume", robots };
}

export default async function ResumePage({ params }: ResumePageProps) {
  const { documentId } = await params;
  const result = await resolveResumeRender(documentId, "published");

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
    // A template the platform doesn't have, or a config it rejects: the
    // document is unrenderable, which is a 404, not a crash. A compat mismatch
    // is a real deployment fault and stays a 500.
    if (error instanceof UnrenderableDocumentError) {
      notFound();
    }
    throw error;
  }
}

/** The non-render outcomes. Deliberately plain: this page is served from the
 * render host, which carries no marketing theme (its `globals.css` is a reset),
 * so it styles itself inline rather than reaching for tokens it doesn't have. */
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

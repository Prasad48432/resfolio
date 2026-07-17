import { resumeClassic } from "@resfolio/template-resume-classic";
import { notFound } from "next/navigation";

import { env } from "@/lib/env";
import {
  renderResumeDocument,
  UnrenderableDocumentError,
} from "@/lib/render-resume";
import { resolveFixtureRender } from "@/lib/resolve";

/**
 * The **fixture render route** — dev and CI only.
 *
 * `scripts/export-pdf.mts` and `scripts/check:ats` must exercise the real
 * template through the real Chromium with no database, no user, and no
 * account: that is what makes the ATS check runnable in CI. They used to reach
 * the render route with an `inline` token payload carrying the template + config;
 * removing the token (doc 02) took that vehicle away, so the fixture path gets
 * its own honest route instead of the product path growing a dev backdoor.
 *
 * Gated on `NODE_ENV`: in production this 404s before touching anything, so the
 * repo's sample profiles are never servable from a real deployment.
 *
 * Note this sits at `/render/resume/fixture/[key]` — two segments deep, so it
 * cannot collide with `/render/resume/[documentId]`.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

interface FixturePageProps {
  params: Promise<{ key: string }>;
}

export default async function ResumeFixturePage({ params }: FixturePageProps) {
  if (env.NODE_ENV === "production") {
    notFound();
  }

  const { key } = await params;

  let inputs;
  try {
    inputs = resolveFixtureRender(key, resumeClassic.id, {
      ...resumeClassic.defaultConfig,
    });
  } catch {
    // No such fixture key.
    notFound();
  }

  try {
    return renderResumeDocument(inputs);
  } catch (error) {
    if (error instanceof UnrenderableDocumentError) {
      notFound();
    }
    throw error;
  }
}

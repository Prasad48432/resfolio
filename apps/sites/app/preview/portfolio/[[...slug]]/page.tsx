import {
  InvalidPreviewTokenError,
  verifyPreviewToken,
} from "@resfolio/portfolio/token";
import { buildProfileView, type ViewDefinition } from "@resfolio/profile";
import { notFound } from "next/navigation";

import { env } from "@/lib/env";
import { renderPortfolioPage } from "@/lib/render-portfolio-page";

/**
 * The private portfolio **draft-preview route** (docs/architecture/08-dashboard-ux.md,
 * 09-rendering-pipeline.md): the dashboard editor iframes this to show the
 * user's *draft* portfolio rendered by the real template — "never edit
 * blindly". Token-guarded (the owner's short-TTL preview token is the
 * capability), never cached, never indexed, and framed only by the dashboard
 * (CSP `frame-ancestors` in `next.config.ts`).
 *
 * Resolve differs from the public route — the **draft** profile + the owner's
 * (possibly unpublished) Site config — but Render is the shared
 * `renderPortfolioPage`, so preview and the live site are pixel-identical.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

interface PreviewPageProps {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PortfolioPreviewPage({
  params,
  searchParams,
}: PreviewPageProps) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  if (typeof token !== "string") {
    notFound();
  }

  let payload;
  try {
    payload = verifyPreviewToken(token, env.PRINT_TOKEN_SECRET);
  } catch (error) {
    if (error instanceof InvalidPreviewTokenError) {
      notFound();
    }
    throw error;
  }

  const userId = payload.ref;

  // Draft profile + the owner's Site (its draft template + config). Both are
  // dynamically imported so the rest of the app needs no database.
  const [{ getProfile }, { getSiteForOwner }] = await Promise.all([
    import("@resfolio/profile/server"),
    import("@resfolio/portfolio/server"),
  ]);

  const [draft, site] = await Promise.all([
    getProfile(userId),
    getSiteForOwner(userId),
  ]);
  if (!site) {
    notFound();
  }

  // `site.view` is opaque in the domain but the repository stores it validated
  // against `viewDefinitionSchema`, so it's a real ViewDefinition at runtime.
  const view = buildProfileView(draft.data, site.view as ViewDefinition);

  // Links point at the real public path so the preview looks like the live
  // site; the preview only ever renders the requested page.
  return renderPortfolioPage({
    view,
    templateId: site.templateId,
    config: site.config,
    slug,
    basePath: `/p/${site.slug}`,
  });
}

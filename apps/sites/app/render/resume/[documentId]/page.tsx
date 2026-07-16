import { InvalidTokenError, verifyRenderToken } from "@resfolio/document/token";
import { PROFILE_VIEW_VERSION, resolveTheme } from "@resfolio/template-sdk";
import { notFound } from "next/navigation";

import { env } from "@/lib/env";
import { resolveRender } from "@/lib/resolve";
import { getResumeTemplate } from "@/lib/templates";

/**
 * The private resume **print route** (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md): Server Component, zero client JS, token-guarded,
 * never cached. Runs Resolve → Project → Render — the same component and
 * fonts Playwright loads at export and the dashboard renders in preview, so
 * all three are pixel-identical.
 *
 * The signed token names a profile snapshot (source/ref) and how to render it:
 * an inline spec (the fixture/export-script path, no DB) or a stored `documents`
 * row this route looks up (the dashboard/product path, 4E). For a stored token
 * the URL's `documentId` must match the token's — the token is the capability,
 * the id in the path is a cross-check.
 */
export const dynamic = "force-dynamic";

// This surface is private and must never be indexed. The `X-Robots-Tag` header
// in `next.config.ts` is the authoritative signal for crawlers; this metadata
// is the belt-and-suspenders now that the app has no global robots directive.
export const metadata = {
  robots: { index: false, follow: false },
};

interface PrintPageProps {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResumePrintPage({
  params,
  searchParams,
}: PrintPageProps) {
  const [{ documentId }, { token }] = await Promise.all([params, searchParams]);
  if (typeof token !== "string") {
    notFound();
  }

  let payload;
  try {
    payload = verifyRenderToken(token, env.PRINT_TOKEN_SECRET);
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      notFound();
    }
    throw error;
  }

  if (
    payload.document.kind === "stored" &&
    payload.document.id !== documentId
  ) {
    notFound();
  }

  const { view, spec } = await resolveRender(payload);

  const template = getResumeTemplate(spec.templateId);
  if (!template) {
    notFound();
  }

  // The platform refuses to render a template whose contract it can't satisfy.
  if (template.compat.profileView !== PROFILE_VIEW_VERSION) {
    throw new Error(
      `Template "${template.id}" targets ProfileView v${template.compat.profileView}, host builds v${PROFILE_VIEW_VERSION}.`,
    );
  }

  const parsedConfig = template.configSchema.safeParse(spec.config);
  if (!parsedConfig.success) {
    notFound();
  }
  const config = parsedConfig.data;

  const accent = (config as { accent?: string }).accent;
  const theme = resolveTheme(template, {
    overrides: accent ? { "--rf-accent": accent } : undefined,
  });

  const ResumeDocument = template.document;
  return <ResumeDocument view={view} config={config} theme={theme} />;
}

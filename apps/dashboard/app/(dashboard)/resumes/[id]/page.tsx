import { requireSession } from "@resfolio/auth";
import { DocumentNotFoundError } from "@resfolio/document";
import { getDocument } from "@resfolio/document/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import type { ResumeClassicConfig } from "@resfolio/template-resume-classic";
import { notFound } from "next/navigation";

import { ResumeEditor } from "@/components/resume/resume-editor";
import { getResumeTemplate } from "@/lib/resume-templates";
import { resumeExportEnabled, resumePublicUrl } from "@/lib/resume-url";

/**
 * The resume document editor (docs/architecture/08-dashboard-ux.md — the split
 * workspace: config form left, live preview right). Loads the document + the
 * profile draft server-side, then hands both to the client island. The preview
 * builds its ProfileView client-side from the draft via the same pure
 * `buildProfileView` the print route runs — that shared function is the parity
 * guarantee (doc 09). Defense in depth: the page guards its own session.
 */
export default async function ResumeEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireSession();

  let document;
  try {
    document = await getDocument(user.id, id);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      notFound();
    }
    throw error;
  }

  const draft = await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });

  // Validate stored config with the document's own template schema (stored
  // config may predate a schema change; parse with defaults so the editor
  // always starts valid). Every resume config shares one shape, so the parsed
  // result is a `ResumeClassicConfig` the shared editor form understands. An
  // unregistered template shouldn't happen for an owned document, but 404 if so.
  const template = getResumeTemplate(document.templateId);
  if (!template) {
    notFound();
  }
  const config = template.configSchema.parse(
    document.config,
  ) as ResumeClassicConfig;

  return (
    <ResumeEditor
      documentId={document.id}
      templateId={document.templateId}
      initialName={document.name}
      initialConfig={config}
      initialView={document.view}
      initialVisibility={document.visibility}
      profile={draft.data}
      publicUrl={resumePublicUrl(document.id)}
      exportEnabled={resumeExportEnabled()}
    />
  );
}

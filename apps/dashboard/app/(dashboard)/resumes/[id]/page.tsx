import { requireSession } from "@resfolio/auth";
import { DocumentNotFoundError } from "@resfolio/document";
import { getDocument } from "@resfolio/document/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { resumeClassicConfigSchema } from "@resfolio/template-resume-classic";
import { notFound } from "next/navigation";

import { ResumeEditor } from "@/components/resume/resume-editor";
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

  // Stored config may predate a config-schema change; parse (with defaults) so
  // the editor always starts from a valid, current config.
  const config = resumeClassicConfigSchema.parse(document.config);

  return (
    <ResumeEditor
      documentId={document.id}
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

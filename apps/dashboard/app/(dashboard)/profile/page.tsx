import { requireSession } from "@resfolio/auth";
import { getOrCreateProfile } from "@resfolio/profile/server";

import { ProfileEditor } from "@/components/profile/profile-editor";

/**
 * The profile editor route — the product's default screen and source of
 * truth (docs/architecture/08-dashboard-ux.md). Reads (or seeds) the draft
 * server-side via the domain, then hands it to the client editor island.
 * Defense in depth: the page guards its own session, not just the layout.
 */
export default async function ProfilePage() {
  const { user } = await requireSession();
  const draft = await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });

  return (
    <ProfileEditor
      initialDraft={draft.data}
      initialRev={draft.draftRev}
      publishedVersion={draft.publishedVersion}
      initialHasUnpublishedChanges={draft.hasUnpublishedChanges}
    />
  );
}

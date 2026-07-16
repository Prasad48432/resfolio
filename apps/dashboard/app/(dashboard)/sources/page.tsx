import { requireSession } from "@resfolio/auth";
import {
  listConnections,
  listImportReceipts,
  listPendingItems,
} from "@resfolio/integrations/server";
import { getOrCreateProfile } from "@resfolio/profile/server";

import { SourcesView } from "@/components/sources/sources-view";
import {
  toConnectionView,
  toPendingItemView,
  toReceiptView,
} from "@/lib/sources";

/**
 * Sources — the import workspace
 * (docs/architecture/12-integrations-and-sync.md): import professional
 * content from external sources into the profile draft. Reads server-side
 * via the integrations domain; every mutation goes through `actions.ts`.
 * Imported content becomes ordinary profile content — providers keep no
 * ongoing ownership — and publish stays at `/profile`.
 */
export default async function SourcesPage() {
  const { user } = await requireSession();
  await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });
  const [connections, pending, receipts] = await Promise.all([
    listConnections(user.id),
    listPendingItems(user.id),
    listImportReceipts(user.id),
  ]);

  return (
    <SourcesView
      connections={connections.map(toConnectionView)}
      pending={pending.map(toPendingItemView)}
      receipts={receipts.map(toReceiptView)}
    />
  );
}

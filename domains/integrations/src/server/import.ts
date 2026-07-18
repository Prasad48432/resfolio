import { eq } from "drizzle-orm";

import { db, schema } from "@resfolio/database";
import {
  addItem,
  createItemId,
  updateBasics,
  updateItem,
  type CustomItem,
  type ItemSource,
  type Profile,
} from "@resfolio/profile";
import {
  getProfile,
  saveDraft,
  StaleDraftError,
} from "@resfolio/profile/server";

import {
  buildProfileItem,
  buildProfileLink,
  contentFingerprint,
  extractAppliedPayload,
  sameLinkUrl,
} from "../apply";
import { assertRouteTarget } from "../routing";
import {
  candidateItemSchema,
  type CandidateItem,
  type RouteTarget,
} from "../candidate";
import { IntegrationDataError } from "./errors";
import {
  IMPORTABLE_STATES,
  requireOwnedItem,
  type ItemState,
} from "./repository";

/**
 * Import — the pipeline's last stage (docs/architecture/12-integrations-and-sync.md).
 * Importing a candidate is an **ordinary `@resfolio/profile` draft mutation**
 * through the pure edit helpers: there is no other code path from a provider
 * to the Profile, and nothing reaches it without this explicit user action.
 * Everything lands in the draft; publishing stays the user's separate act
 * (doc 01). Provenance is stamped by `buildProfileItem` (`source`,
 * `sourceId`, fresh item id) and after the import the staged row becomes a
 * **receipt**: `baseFingerprint` (the content imported — the dedupe key) +
 * `appliedFingerprint` (the content as applied, after any inline edits — the
 * re-import warning's memory). The imported item is the user's ordinary
 * content from here on.
 *
 * A re-import (`refresh_available`) refreshes the previously-imported item in
 * place — including over a user edit, because the user explicitly clicked
 * through the warning the UI derives from `detectUserEdit`.
 */

/** Default custom-section home per kind when the user doesn't name one. */
const CUSTOM_SECTION_TITLES: Partial<Record<CandidateItem["kind"], string>> = {
  talk: "Talks",
  unclassified: "Imported",
};

export interface ImportItemOptions {
  /** User route override (doc 12 — the routing stage's final say). Validated
   * against the kind's compatible targets; required for unrouted items. */
  routeTo?: RouteTarget;
  /** Which custom section a `custom`-routed item lands in (found by title,
   * created on first import). Defaults per kind ("Talks", "Imported"). */
  customSectionTitle?: string;
  /** Inline edit-before-import: merged into the payload and re-validated by
   * the candidate schema, so nothing schema-invalid can reach the draft. */
  edits?: Record<string, unknown>;
}

interface ApplyOutcome {
  next: Profile;
  appliedItemId: string | null;
  appliedSectionKey: string | null;
}

function findCustomSectionForItem(profile: Profile, itemId: string) {
  return profile.sections.custom.find((section) =>
    section.items.some((item) => item.id === itemId),
  );
}

function addToCustomSection(
  profile: Profile,
  item: CustomItem,
  source: ItemSource,
  sectionTitle: string,
): Profile {
  const section = profile.sections.custom.find(
    (candidate) => candidate.title.toLowerCase() === sectionTitle.toLowerCase(),
  );
  if (section) {
    return updateItem(profile, "custom", section.id, {
      items: [...section.items, item],
    });
  }
  return addItem(profile, "custom", {
    id: createItemId(),
    source,
    title: sectionTitle,
    items: [item],
  });
}

function updateCustomItem(
  profile: Profile,
  appliedItemId: string,
  payload: Record<string, unknown>,
): Profile {
  const section = findCustomSectionForItem(profile, appliedItemId);
  if (!section) {
    throw new IntegrationDataError("The imported item no longer exists.");
  }
  const items = section.items.map((item) =>
    item.id === appliedItemId
      ? {
          ...item,
          ...payload,
          id: item.id,
          source: item.source,
          sourceId: item.sourceId,
        }
      : item,
  );
  return updateItem(profile, "custom", section.id, { items });
}

/** The maximum `basicsSchema.links` accepts. Checked here so a full link list
 * fails with something a user can act on, rather than as a raw schema error
 * from deep inside `updateBasics`. */
const MAX_LINKS = 20;

/**
 * Merge a link into `basics.links`. The merge lives here rather than in the
 * pure layer because `updateBasics` **replaces** the array wholesale — passing
 * a single link through it would delete every other link the user has.
 *
 * Three ways in, in priority order: the receipt's `appliedItemId` (a re-import
 * of a link we placed), then a url match (the user already added this link by
 * hand — adopt it rather than duplicate it), then append. Links carry no
 * provenance of their own (`profileLinkSchema` is `{ id, label, url }`), so url
 * is the only key available for that second case.
 */
function mergeProfileLink(
  profile: Profile,
  candidate: Extract<CandidateItem, { kind: "profileLink" }>,
  appliedItemId: string | null,
): ApplyOutcome {
  const links = profile.basics.links;
  const built = buildProfileLink(candidate);

  const existing =
    links.find((link) => appliedItemId !== null && link.id === appliedItemId) ??
    links.find((link) => sameLinkUrl(link.url, built.url));

  if (existing) {
    const next = links.map((link) =>
      link.id === existing.id
        ? { ...link, label: built.label, url: built.url }
        : link,
    );
    return {
      next: updateBasics(profile, { links: next }),
      appliedItemId: existing.id,
      appliedSectionKey: "links",
    };
  }

  if (links.length >= MAX_LINKS) {
    throw new IntegrationDataError(
      `Your profile already has ${MAX_LINKS} links — remove one to import another.`,
    );
  }

  return {
    next: updateBasics(profile, { links: [...links, built] }),
    appliedItemId: built.id,
    appliedSectionKey: "links",
  };
}

/** Mutate the draft for this import. Pure over the loaded Profile — called
 * (and re-called) by the optimistic-concurrency retry below. */
function applyToProfile(
  profile: Profile,
  candidate: CandidateItem,
  connectorId: string,
  appliedItemId: string | null,
  customSectionTitle: string,
): ApplyOutcome {
  if (candidate.kind === "profileLink") {
    return mergeProfileLink(profile, candidate, appliedItemId);
  }

  // A re-import refreshes the previously-imported item in place when it still
  // exists; otherwise (or for a first import) it lands as a fresh item.
  const stillExists =
    appliedItemId !== null &&
    extractAppliedPayload(profile, candidate.kind, appliedItemId) !== null;

  // Build once: the canonical item shape for this candidate (also converts
  // `unclassified` → custom-item content). For an in-place update the fresh
  // identity is discarded — provenance is never patchable.
  const built = buildProfileItem(candidate, connectorId);

  if (appliedItemId && stillExists) {
    const payload = { ...(built.item as Record<string, unknown>) };
    delete payload["id"];
    delete payload["source"];
    delete payload["sourceId"];
    if (built.sectionKey === "custom") {
      return {
        next: updateCustomItem(profile, appliedItemId, payload),
        appliedItemId,
        appliedSectionKey: "custom",
      };
    }
    return {
      next: updateItem(profile, built.sectionKey, appliedItemId, payload),
      appliedItemId,
      appliedSectionKey: built.sectionKey,
    };
  }

  if (built.sectionKey === "custom") {
    return {
      next: addToCustomSection(
        profile,
        built.item,
        built.item.source,
        customSectionTitle,
      ),
      appliedItemId: built.item.id,
      appliedSectionKey: "custom",
    };
  }
  return {
    next: addItem(profile, built.sectionKey, built.item),
    appliedItemId: built.item.id,
    appliedSectionKey: built.sectionKey,
  };
}

export interface ImportResult {
  itemId: string;
  appliedItemId: string | null;
}

/**
 * Import a candidate into the profile **draft** — first import or explicit
 * re-import. The route resolves user override → staged route; an unrouted
 * item without an override is refused (it "needs a home" — doc 12), and
 * every destination is validated against the kind's compatible targets so a
 * mis-route can't produce an invalid profile. Retries once on a concurrent
 * draft write.
 */
export async function importItem(
  userId: string,
  itemId: string,
  options: ImportItemOptions = {},
): Promise<ImportResult> {
  const { item, connection } = await requireOwnedItem(userId, itemId);
  const state = item.state as ItemState;
  if (!IMPORTABLE_STATES.includes(state)) {
    throw new IntegrationDataError("This item isn't awaiting import.");
  }

  const stored = candidateItemSchema.parse(item.candidate);
  const candidate = options.edits
    ? candidateItemSchema.parse({
        ...stored,
        payload: { ...stored.payload, ...options.edits },
      })
    : stored;

  // The Route stage's final say: the user's override, else the staged route.
  // Unrouted without an override stays in the workspace — never guessed.
  const target: RouteTarget | null =
    options.routeTo ?? (item.routeSectionKey as RouteTarget | null);
  if (target === null) {
    throw new IntegrationDataError(
      "Choose where this item should go before importing it.",
    );
  }
  assertRouteTarget(candidate.kind, target);

  const customSectionTitle =
    options.customSectionTitle?.trim() ||
    CUSTOM_SECTION_TITLES[candidate.kind] ||
    "Imported";

  // Optimistic concurrency against the draft: reload + reapply once if an
  // autosave from the editor landed between our read and write.
  let outcome: ApplyOutcome | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const draft = await getProfile(userId);
    outcome = applyToProfile(
      draft.data,
      candidate,
      connection.connectorId,
      item.appliedItemId,
      customSectionTitle,
    );
    try {
      await saveDraft(userId, outcome.next, draft.draftRev);
      break;
    } catch (error) {
      if (error instanceof StaleDraftError && attempt === 0) {
        continue;
      }
      throw error;
    }
  }
  if (!outcome) {
    throw new IntegrationDataError("Failed to import the item.");
  }

  // Turn the staged row into a receipt: the dedupe key + the re-import
  // warning's memory. Extracted from the post-apply profile so inline edits
  // and schema defaults are captured exactly as stored.
  const appliedPayload =
    outcome.appliedSectionKey === null
      ? null
      : extractAppliedPayload(
          outcome.next,
          candidate.kind,
          outcome.appliedItemId,
        );

  await db
    .update(schema.integrationItem)
    .set({
      state: "imported",
      routeSectionKey: target,
      routeConfidence: "certain",
      baseFingerprint: item.fingerprint,
      appliedFingerprint: appliedPayload
        ? contentFingerprint(candidate.kind, appliedPayload)
        : null,
      appliedItemId: outcome.appliedItemId,
      appliedSectionKey: outcome.appliedSectionKey,
    })
    .where(eq(schema.integrationItem.id, item.id));

  return { itemId: item.id, appliedItemId: outcome.appliedItemId };
}

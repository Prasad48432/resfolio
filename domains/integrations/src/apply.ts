import {
  createItemId,
  ITEM_SOURCES,
  type CertificationItem,
  type CustomItem,
  type EducationItem,
  type ExperienceItem,
  type ItemSource,
  type Profile,
  type ProfileLink,
  type ProjectItem,
  type SkillGroup,
  type WritingItem,
} from "@resfolio/profile";

import { type CandidateItem, type CandidateKind } from "./candidate";
import { COMPATIBLE_ROUTE_TARGETS } from "./routing";
import { computeFingerprint } from "./fingerprint";
import { CandidateApplyError } from "./errors";

/**
 * The pure half of Import (docs/architecture/12-integrations-and-sync.md):
 * mapping a candidate onto the Profile's canonical shapes, and the content
 * fingerprint that detects a user edit later (the re-import warning's input).
 * The DB half (draft load/save, receipt bookkeeping) lives in `./server` —
 * these functions take and return plain values so the import invariants are
 * unit-testable without a database.
 */

/** The one profile destination a kind's payload maps onto (V1 routing is 1:1;
 * see `COMPATIBLE_ROUTE_TARGETS`). `profileLink` lands in `basics.links`;
 * `talk`/`unclassified` land inside a custom section. */
export function sectionForKind(
  kind: CandidateKind,
): (typeof COMPATIBLE_ROUTE_TARGETS)[CandidateKind][number] {
  const target = COMPATIBLE_ROUTE_TARGETS[kind][0];
  if (!target) {
    throw new CandidateApplyError(`Kind "${kind}" has no route target.`);
  }
  return target;
}

/** Provider ids that are also profile `ItemSource`s. A new connector whose id
 * isn't a registered source is a deliberate profile-schema decision (doc 01),
 * so this throws rather than guessing. */
const KNOWN_SOURCES = new Set<string>(
  ITEM_SOURCES.filter((source) => source !== "manual"),
);

function toItemSource(connectorId: string): ItemSource {
  if (!KNOWN_SOURCES.has(connectorId)) {
    throw new CandidateApplyError(
      `Connector "${connectorId}" has no profile ItemSource — add it to ITEM_SOURCES (doc 01) before importing its candidates.`,
    );
  }
  return connectorId as ItemSource;
}

export type BuiltProfileItem =
  | { sectionKey: "experience"; item: ExperienceItem }
  | { sectionKey: "projects"; item: ProjectItem }
  | { sectionKey: "skills"; item: SkillGroup }
  | { sectionKey: "education"; item: EducationItem }
  | { sectionKey: "writing"; item: WritingItem }
  | { sectionKey: "certifications"; item: CertificationItem }
  | { sectionKey: "custom"; item: CustomItem };

/** An `unclassified` payload as custom-item content — the shape it takes when
 * the user routes it to a custom section. */
function unclassifiedToCustomPayload(
  payload: Extract<CandidateItem, { kind: "unclassified" }>["payload"],
): Omit<CustomItem, "id" | "source" | "sourceId"> {
  return {
    title: payload.title,
    subtitle: "",
    url: payload.url,
    startDate: payload.date,
    endDate: undefined,
    summary: payload.text,
    highlights: [],
  };
}

/**
 * A candidate as a brand-new Profile item, provenance stamped (doc 12): fresh
 * `createItemId()` → `id`, the provider → `source`, the candidate's
 * `externalId` → `sourceId`. `profileLink` is not a section item — use
 * `buildProfileLink` instead.
 */
export function buildProfileItem(
  candidate: CandidateItem,
  connectorId: string,
): BuiltProfileItem {
  const provenance = {
    id: createItemId(),
    source: toItemSource(connectorId),
    sourceId: candidate.externalId,
  };
  switch (candidate.kind) {
    case "project":
    case "contribution":
      return {
        sectionKey: "projects",
        item: { ...candidate.payload, ...provenance },
      };
    case "article":
      return {
        sectionKey: "writing",
        item: { ...candidate.payload, ...provenance },
      };
    case "experience":
      return {
        sectionKey: "experience",
        item: { ...candidate.payload, ...provenance },
      };
    case "education":
      return {
        sectionKey: "education",
        item: { ...candidate.payload, ...provenance },
      };
    case "skillGroup":
      return {
        sectionKey: "skills",
        item: { ...candidate.payload, ...provenance },
      };
    case "certification":
      return {
        sectionKey: "certifications",
        item: { ...candidate.payload, ...provenance },
      };
    case "talk":
      return {
        sectionKey: "custom",
        item: { ...candidate.payload, ...provenance },
      };
    case "unclassified":
      return {
        sectionKey: "custom",
        item: { ...unclassifiedToCustomPayload(candidate.payload), ...provenance },
      };
    case "profileLink":
      throw new CandidateApplyError(
        "profileLink lands in basics.links — use buildProfileLink.",
      );
  }
}

/**
 * A `profileLink` candidate as a profile link. Links carry no `source`/
 * `sourceId` — `profileLinkSchema` is `{ id, label, url }` and widening it is a
 * profile schema decision (doc 01) — so provenance lives only in the import
 * receipt, and `id` is the join back. That makes **url the dedupe key**, unlike
 * section items which dedupe on provenance; see `mergeProfileLink` in
 * `./server/import.ts`.
 */
export function buildProfileLink(
  candidate: Extract<CandidateItem, { kind: "profileLink" }>,
): ProfileLink {
  return {
    id: createItemId(),
    label: candidate.payload.label,
    url: candidate.payload.url,
  };
}

/** Compare two link urls for the dedupe rule: a trailing slash and a
 * differently-cased host are the same link to a human, so they must be the same
 * link to us — importing GitHub twice may never leave two GitHub links. Path
 * case is preserved (`/Ada` ≠ `/ada` on most providers). */
export function sameLinkUrl(a: string, b: string): boolean {
  return normalizeLinkUrl(a) === normalizeLinkUrl(b);
}

function normalizeLinkUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    // `URL` already lowercases protocol + host; strip only a bare trailing
    // slash so "https://github.com/ada/" === "https://github.com/ada".
    const path = url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    // Not a parseable absolute URL (mailto: etc.) — compare as typed.
    return trimmed.toLowerCase();
  }
}

/**
 * Fingerprint of imported content — the user-edit detector's memory. Recorded
 * at import over the payload as applied (after inline edits); before a
 * re-import the runtime extracts the draft item's current content and
 * compares. Reuses `computeFingerprint` with the identity fields neutralized
 * so only kind + payload participate.
 */
export function contentFingerprint(
  kind: CandidateKind,
  payload: Record<string, unknown>,
): string {
  // Cast: computeFingerprint only reads kind/payload/url/media/metrics, and
  // everything except kind+payload is pinned constant here.
  return computeFingerprint({
    kind,
    payload,
    externalId: "-",
    title: "-",
    media: [],
    metrics: [],
    raw: null,
  } as unknown as CandidateItem);
}

/** A profile item's content with provenance stripped — the "current payload"
 * side of the user-edit comparison. */
function stripProvenance(item: Record<string, unknown>): Record<string, unknown> {
  const content = { ...item };
  delete content["id"];
  delete content["source"];
  delete content["sourceId"];
  return content;
}

/**
 * The current draft content behind an imported candidate, or `null` when the
 * user removed it (which counts as an edit — a re-import may not resurrect it
 * silently). Pure over the Profile so the re-import warning is testable
 * without a database.
 */
export function extractAppliedPayload(
  profile: Profile,
  kind: CandidateKind,
  appliedItemId: string | null,
): Record<string, unknown> | null {
  if (!appliedItemId) {
    return null;
  }
  const sectionKey = sectionForKind(kind);
  if (sectionKey === "links") {
    const link = profile.basics.links.find((entry) => entry.id === appliedItemId);
    return link ? { label: link.label, url: link.url } : null;
  }
  if (sectionKey === "custom") {
    for (const section of profile.sections.custom) {
      const item = section.items.find((entry) => entry.id === appliedItemId);
      if (item) {
        return stripProvenance(item);
      }
    }
    return null;
  }
  const items = profile.sections[sectionKey] as Record<string, unknown>[];
  const item = items.find((entry) => entry["id"] === appliedItemId);
  return item ? stripProvenance(item) : null;
}

/**
 * Has the user edited (or removed) the imported item since it was applied?
 * The re-import warning's input: `true` means a re-import would replace the
 * user's words, so the UI must say so before the click. Never imported
 * (`appliedFingerprint === null`) → `false` — nothing of the user's to
 * protect yet.
 */
export function detectUserEdit(
  profile: Profile,
  kind: CandidateKind,
  appliedItemId: string | null,
  appliedFingerprint: string | null,
): boolean {
  if (!appliedFingerprint) {
    return false;
  }
  const current = extractAppliedPayload(profile, kind, appliedItemId);
  if (current === null) {
    return true; // The user removed it — a re-import may not resurrect it silently.
  }
  return contentFingerprint(kind, current) !== appliedFingerprint;
}

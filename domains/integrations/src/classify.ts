/**
 * The import classification (docs/architecture/12-integrations-and-sync.md).
 * Pure — the fingerprint recorded at last import is the comparison base.
 *
 * Import semantics, not sync semantics: after import the staged row is an
 * **import receipt**, and re-fetching may at most suggest a re-import. The
 * never-overwrite invariant is structural here — nothing is ever applied
 * without a user click, so there is no conflict state to resolve and no
 * archive suggestion (upstream deletion produces nothing; the user's
 * imported item doesn't care that a repo was deleted).
 *
 * | Upstream vs. receipt              | Classification      |
 * | --------------------------------- | ------------------- |
 * | never imported                    | `new`               |
 * | same fingerprint as the receipt   | `duplicate` (skip)  |
 * | changed fingerprint vs. receipt   | `refresh_available` |
 *
 * `duplicate` is what makes re-imports idempotent: importing the same feed
 * twice can never create a second copy. `refresh_available` is only ever a
 * badge + a re-import button; whether the user edited their copy since import
 * is detected separately (`detectUserEdit`) so the UI can warn — "this will
 * replace your edited copy" — on that explicit, user-initiated re-import.
 */

export const IMPORT_CLASSIFICATIONS = [
  "new",
  "duplicate",
  "refresh_available",
] as const;

export type ImportClassification = (typeof IMPORT_CLASSIFICATIONS)[number];

export interface ClassifyInput {
  /** Fingerprint of the freshly-fetched candidate (`computeFingerprint`). */
  externalFingerprint: string;
  /** Fingerprint recorded at the last import (the receipt), or `null` if this
   * `externalId` was never imported. */
  baseFingerprint: string | null;
}

/** Decide what a fetched candidate means for the workspace. */
export function classifyCandidate(input: ClassifyInput): ImportClassification {
  const { externalFingerprint, baseFingerprint } = input;
  if (baseFingerprint === null) {
    return "new";
  }
  if (externalFingerprint === baseFingerprint) {
    return "duplicate";
  }
  return "refresh_available";
}

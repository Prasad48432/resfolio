/**
 * The three-way merge decision (docs/architecture/12-integrations-and-sync.md).
 * Pure — the provenance fingerprint recorded at last accept is the merge base.
 * This is where the phase's non-negotiable rule lives: imports may update their
 * own untouched previous import, and may **never** touch a user edit.
 *
 * | External changed? | User edited since import? | Result   |
 * | ----------------- | ------------------------- | -------- |
 * | new item          | —                         | new      |
 * | yes               | no                        | updated  |
 * | yes               | yes                       | conflict |
 * | no                | —                         | unchanged|
 * | removed           | —                         | archive  |
 *
 * `updated` is the only state the runtime may auto-apply (when the connection's
 * auto-accept is on) — and it is unreachable for an edited item by construction.
 */

export const CANDIDATE_STATES = [
  "new",
  "updated",
  "conflict",
  "unchanged",
  "archive",
] as const;

export type CandidateState = (typeof CANDIDATE_STATES)[number];

export interface ClassifyInput {
  /** Fingerprint of the freshly-fetched candidate (`computeFingerprint`). */
  externalFingerprint: string;
  /** Fingerprint recorded at the last accept (the merge base), or `null` if
   * this `externalId` was never imported. */
  baseFingerprint: string | null;
  /** Has the user edited the applied item since it was imported? (The runtime
   * derives this by comparing the applied item's current content to its stored
   * import fingerprint — an edit shifts it.) */
  userEdited: boolean;
  /** Did this `externalId` disappear from the provider this run? */
  upstreamRemoved?: boolean;
}

/**
 * Decide a candidate's review state. `archive` (removed upstream) takes
 * precedence — there is no new content to merge. Otherwise: never-seen →
 * `new`; identical to base → `unchanged`; changed splits on whether the user
 * touched it — edited → `conflict` (always reviewed), untouched → `updated`.
 */
export function classifyCandidate(input: ClassifyInput): CandidateState {
  const {
    externalFingerprint,
    baseFingerprint,
    userEdited,
    upstreamRemoved = false,
  } = input;

  if (upstreamRemoved) {
    // Removed upstream is a *suggestion* to archive — never auto-applied.
    return "archive";
  }
  if (baseFingerprint === null) {
    return "new";
  }
  if (externalFingerprint === baseFingerprint) {
    return "unchanged";
  }
  // Upstream changed. A user edit is sacred: it can never be silently
  // overwritten, so an edited item is always a conflict, never an update.
  return userEdited ? "conflict" : "updated";
}

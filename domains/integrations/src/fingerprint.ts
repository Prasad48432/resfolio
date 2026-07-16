import type { CandidateItem } from "./candidate";

/**
 * The content fingerprint — the merge base for the three-way conflict policy
 * (docs/architecture/12-integrations-and-sync.md). Recorded at last accept;
 * a changed fingerprint on a later sync means the provider changed the item.
 *
 * Deterministic and dependency-free (no `node:crypto`), so it's environment-
 * agnostic and trivially testable. It hashes only the content that would land
 * in the Profile — never `raw`, whose provider churn (rate-limit fields,
 * timestamps) must not manufacture phantom "updates".
 */

/** FNV-1a over a string with a seed, as unsigned 32-bit → 8 hex chars. */
function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable stringify: object keys sorted recursively so key order never shifts
 * the hash. Arrays keep order (it's meaningful). `undefined` → `null`. */
function canonical(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`)
    .join(",")}}`;
}

/**
 * Fingerprint a candidate's canonical content. Two seeds concatenated → a
 * 16-hex-char (~64-bit) digest, wide enough that a genuine change is never
 * mistaken for "unchanged".
 */
export function computeFingerprint(candidate: CandidateItem): string {
  const content = {
    kind: candidate.kind,
    payload: candidate.payload,
    url: candidate.url ?? null,
    media: candidate.media,
    metrics: candidate.metrics,
  };
  const serialized = canonical(content);
  return fnv1a(serialized, 0x811c9dc5) + fnv1a(serialized, 0x1000193);
}

import { createHash } from "node:crypto";

import type { DocumentConfig } from "@resfolio/document";
import type { ViewDefinition } from "@resfolio/profile";

/**
 * Content-addressed render identity (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md). Deterministic inputs → a stable key, so an
 * unchanged export is a cache hit (no Chromium boot) and stale output is
 * structurally impossible — a change yields a new key, never an in-place
 * mutation. Template version is part of the key so a template bump busts it.
 *
 * **Every input must actually identify content.** This previously hashed
 * `source` + `ref`, where `ref` was the owner's userId for a draft — a stable
 * value that never changed when the draft did, so editing a profile and
 * re-exporting served the old PDF from cache. Invisible while only the fixture
 * path (immutable content) was exercised; a live bug the moment export ran
 * against a draft. `revision` replaces both: it is the *snapshot's* identity,
 * and it is the caller's job to make it change whenever the content does.
 */

/** The identity inputs of a render: which profile snapshot, and how it is
 * projected + presented. */
export interface RenderKeyInput {
  /**
   * The profile snapshot's identity — `draft:<draftRev>` (bumps on every
   * autosave), `version:<profileVersionId>` (immutable by construction), or
   * `fixture:<key>` (immutable, ships with the repo). Built by
   * `lib/resolve.ts`, never assembled by callers.
   */
  revision: string;
  templateId: string;
  config: DocumentConfig;
  view: ViewDefinition | undefined;
}

/** Canonical JSON with recursively sorted keys — so key order in `config`
 * never changes the hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function renderKey(
  input: RenderKeyInput,
  templateVersion: string,
): string {
  const material = stableStringify({
    revision: input.revision,
    template: `${input.templateId}@${templateVersion}`,
    view: input.view ?? null,
    config: input.config,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 24);
}

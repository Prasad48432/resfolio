import { createHash } from "node:crypto";

import type { DocumentConfig } from "@resfolio/document";
import type { ViewDefinition } from "@resfolio/profile";

/**
 * Content-addressed render identity (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md). Deterministic inputs → a stable key, so an
 * unchanged export is a cache hit (no Chromium boot) and stale output is
 * structurally impossible — a change yields a new key, never an in-place
 * mutation. Template version is part of the key so a template bump busts it.
 */

/** The identity inputs of a render: which profile snapshot, and how it is
 * projected + presented. */
export interface RenderKeyInput {
  source: string;
  ref: string;
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
    source: input.source,
    ref: input.ref,
    template: `${input.templateId}@${templateVersion}`,
    view: input.view ?? null,
    config: input.config,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 24);
}

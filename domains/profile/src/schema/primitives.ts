import { z } from "zod";

/**
 * Shared field primitives for the profile schema
 * (docs/architecture/01-profile-engine.md). Profile data is hostile input
 * rendered on our domains (docs/architecture/10-auth-and-security.md), so
 * URL schemes and rich text are constrained here, at the schema layer —
 * renderers re-check on output, but nothing unsafe reaches storage.
 */

/** Provenance: where an item came from (doc 01 / doc 12). `manual` is the
 * editor; connector values land with their Phase 6 integrations. */
export const ITEM_SOURCES = ["manual", "github", "linkedin", "rss"] as const;

export const itemSourceSchema = z.enum(ITEM_SOURCES);

export type ItemSource = z.infer<typeof itemSourceSchema>;

/** Stable item id — generated once (`createItemId`), never reused. */
export const itemIdSchema = z.string().min(1).max(64);

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function hasAllowedProtocol(value: string, allowed: Set<string>): boolean {
  try {
    return allowed.has(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
}

/** Absolute http/https URL — `javascript:`/`data:` never reach storage. */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => hasAllowedProtocol(value, HTTP_PROTOCOLS), {
    message: "Must be a full http(s) URL.",
  });

/** Link destinations may additionally be mailto: (profile links). */
export const safeLinkUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => hasAllowedProtocol(value, SAFE_LINK_PROTOCOLS), {
    message: "Must be a full http(s) or mailto URL.",
  });

/**
 * ISO calendar date with optional month/day precision (doc 01):
 * `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. An absent end date means ongoing.
 */
export const CALENDAR_DATE_PATTERN =
  /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export const calendarDateSchema = z
  .string()
  .trim()
  .regex(CALENDAR_DATE_PATTERN, {
    message: "Use YYYY, YYYY-MM, or YYYY-MM-DD.",
  });

/** Anything that looks like an opening HTML tag/comment/doctype. */
const RAW_HTML_PATTERN = /<[a-z!/]/i;

/** Destination of a Markdown link: the token after `](`. */
const MARKDOWN_LINK_DESTINATION_PATTERN = /\]\(\s*([^)\s]+)/g;

function markdownLinksAreSafe(value: string): boolean {
  for (const match of value.matchAll(MARKDOWN_LINK_DESTINATION_PATTERN)) {
    const destination = match[1];
    if (destination && !hasAllowedProtocol(destination, SAFE_LINK_PROTOCOLS)) {
      return false;
    }
  }
  return true;
}

/**
 * Rich text (doc 01 open question — decided): a constrained **Markdown
 * subset** — bold, italic, and `[label](url)` links only — stored as a
 * string, chosen over a structured AST for portability (JSON Resume export,
 * plain-text ATS extraction) and diffability. Never raw HTML; our own
 * renderer (Template SDK phase) converts it to React elements and re-checks
 * link schemes on output.
 */
export const richTextSchema = z
  .string()
  .trim()
  .max(4000)
  .refine((value) => !RAW_HTML_PATTERN.test(value), {
    message:
      "HTML is not allowed — use **bold**, _italic_, and [links](https://…).",
  })
  .refine(markdownLinksAreSafe, {
    message: "Links must be full http(s) or mailto URLs.",
  });

/**
 * Optional form-facing field: the editor binds inputs whose empty value is
 * `""`; storage wants those absent. One schema serves both (doc 08 — the
 * form uses the domain schemas directly).
 */
export const optionalField = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

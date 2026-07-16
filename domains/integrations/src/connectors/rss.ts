import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * Generic RSS/Atom connector (docs/architecture/12-integrations-and-sync.md) —
 * `public` mode, no credentials: the user supplies a feed URL. Emits `article`
 * candidates. Subsumes Medium, Substack, personal blogs and podcast feeds in
 * one small connector — the doc-12 "connector in an afternoon" proof and the
 * second auth mode. `fetch` does the HTTP + XML parse; `normalize` is pure.
 */

export const rssInputSchema = z.object({
  feedUrl: z.string().trim().url().max(2048),
});

export type RssInput = z.infer<typeof rssInputSchema>;

/** A feed entry flattened to a provider-agnostic shape by `fetch`, so
 * `normalize` stays a pure RSS-2.0/Atom-independent mapping. */
export interface RssRawEntry {
  feedTitle: string;
  title: string;
  link?: string;
  summary?: string;
  published?: string;
  id: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** Coerce a node that may be a string, `{ "#text" }`, or attribute object to a
 * plain string. */
function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

/** Atom `<link>` may be a string, an object with `@_href`, or an array of
 * those (rel="alternate" preferred). RSS `<link>` is a plain string. */
function linkOf(value: unknown): string | undefined {
  const links = asArray(value as unknown);
  let fallback: string | undefined;
  for (const link of links) {
    if (typeof link === "string" && link.trim()) {
      return link.trim();
    }
    if (link && typeof link === "object") {
      const href = (link as Record<string, unknown>)["@_href"];
      const rel = (link as Record<string, unknown>)["@_rel"];
      if (typeof href === "string" && href.trim()) {
        if (rel === undefined || rel === "alternate") {
          return href.trim();
        }
        fallback ??= href.trim();
      }
    }
  }
  return fallback;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Feed summaries carry HTML; the profile rich-text schema forbids raw HTML
 * (doc 01/10). Strip tags to plain text and collapse whitespace. */
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#?[a-z0-9]+;/gi, (match) => ENTITIES[match.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCalendarDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse a raw feed body (RSS 2.0 or Atom) into flattened entries. Exported for
 * the runtime's `fetch` and unit tests; parsing lives here, not in `normalize`. */
export function parseFeed(xml: string): RssRawEntry[] {
  const doc = parser.parse(xml) as Record<string, unknown>;

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (channel) {
    const feedTitle = toPlainText(textOf(channel.title));
    return asArray(channel.item as unknown).map((raw) => {
      const item = raw as Record<string, unknown>;
      const link = linkOf(item.link);
      const guid = textOf(item.guid);
      return {
        feedTitle,
        title: toPlainText(textOf(item.title)),
        link,
        summary: textOf(item.description) || textOf(item["content:encoded"]),
        published: textOf(item.pubDate) || undefined,
        id: guid || link || textOf(item.title),
      };
    });
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const feedTitle = toPlainText(textOf(feed.title));
    return asArray(feed.entry as unknown).map((raw) => {
      const entry = raw as Record<string, unknown>;
      const link = linkOf(entry.link);
      const id = textOf(entry.id);
      return {
        feedTitle,
        title: toPlainText(textOf(entry.title)),
        link,
        summary: textOf(entry.summary) || textOf(entry.content),
        published: textOf(entry.updated) || textOf(entry.published) || undefined,
        id: id || link || textOf(entry.title),
      };
    });
  }

  return [];
}

async function* fetchFeed(
  ctx: FetchContext<RssInput>,
): AsyncIterable<RssRawEntry> {
  const response = await ctx.fetch(ctx.input.feedUrl, { signal: ctx.signal });
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status}`);
  }
  const xml = await response.text();
  for (const entry of parseFeed(xml)) {
    yield entry;
  }
}

function normalizeEntry(raw: RssRawEntry): CandidateItem[] {
  const title = raw.title.trim();
  if (!title) {
    return [];
  }
  const summary = raw.summary ? toPlainText(raw.summary).slice(0, 500) : "";
  const url =
    raw.link && z.string().url().safeParse(raw.link).success
      ? raw.link
      : undefined;

  const candidate = candidateItemSchema.parse({
    kind: "article",
    externalId: raw.id,
    url,
    title: title.slice(0, 300),
    media: [],
    metrics: [],
    raw,
    payload: {
      title: title.slice(0, 200),
      publisher: raw.feedTitle.slice(0, 160),
      url,
      date: toCalendarDate(raw.published),
      summary,
    },
  });

  return [candidate];
}

export const rss = defineConnector<RssInput, RssRawEntry>({
  id: "rss",
  name: "RSS / Atom feed",
  authMode: "public",
  tier: "B",
  input: rssInputSchema,
  resources: ["article"],
  capabilities: { incremental: false, webhooks: false },
  schedule: { defaultEvery: "24h" },
  fetch: fetchFeed,
  normalize: normalizeEntry,
});

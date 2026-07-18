import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * Dev.to connector (docs/architecture/12-integrations-and-sync.md) — `public`
 * mode, no credentials: the user supplies their Dev.to username and published
 * articles arrive as `article` candidates (→ Writing), with reactions as a
 * metric. Same shape as the RSS connector against a JSON API — the "public
 * connector in an afternoon" pattern, third instance.
 */

export const devtoInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Use your Dev.to username."),
});

export type DevtoInput = z.infer<typeof devtoInputSchema>;

/** The subset of Dev.to's public articles endpoint this connector reads. */
export interface DevtoArticle {
  id: number;
  title: string;
  description: string | null;
  url: string;
  published_at?: string | null;
  /** The API has shipped both shapes over time — handle either. */
  tag_list?: string[] | string;
  positive_reactions_count?: number;
  comments_count?: number;
}

const ARTICLES_URL = "https://dev.to/api/articles";
const PER_PAGE = 100;

async function* fetchArticles(
  ctx: FetchContext<DevtoInput>,
): AsyncIterable<DevtoArticle> {
  let page = 1;
  while (true) {
    const url = `${ARTICLES_URL}?username=${encodeURIComponent(
      ctx.input.username,
    )}&per_page=${PER_PAGE}&page=${page}`;
    const response = await ctx.fetch(url, { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`Dev.to articles failed: ${response.status}`);
    }
    const articles = (await response.json()) as DevtoArticle[];
    if (!Array.isArray(articles) || articles.length === 0) {
      break;
    }
    for (const article of articles) {
      yield article;
    }
    if (articles.length < PER_PAGE) {
      break;
    }
    page += 1;
  }
}

/** ISO timestamp → `YYYY-MM-DD`, or undefined. Deterministic — no clock. */
function toCalendarDate(value: string | null | undefined): string | undefined {
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

function normalizeArticle(raw: DevtoArticle): CandidateItem[] {
  const title = raw.title?.trim();
  if (!title || typeof raw.id !== "number") {
    return [];
  }
  const reactions = raw.positive_reactions_count;
  const candidate = candidateItemSchema.parse({
    kind: "article",
    externalId: String(raw.id),
    url: raw.url,
    title: title.slice(0, 300),
    metrics:
      typeof reactions === "number" && reactions >= 0
        ? [{ key: "reactions", value: reactions }]
        : [],
    raw,
    payload: {
      title: title.slice(0, 200),
      publisher: "DEV Community",
      url: raw.url,
      date: toCalendarDate(raw.published_at),
      summary: (raw.description ?? "").trim().slice(0, 500),
    },
  });
  return [candidate];
}

/** The user's Dev.to profile URL — derived from the username, no request. */
function devtoProfileLinks(input: DevtoInput): CandidateItem[] {
  const url = `https://dev.to/${input.username}`;
  return [
    candidateItemSchema.parse({
      kind: "profileLink",
      externalId: "profile-link",
      url,
      title: "Dev.to profile",
      raw: null,
      payload: { label: "Dev.to", url },
    }),
  ];
}

export const devto = defineConnector<DevtoInput, DevtoArticle>({
  id: "devto",
  name: "Dev.to",
  authMode: "public",
  tier: "A",
  input: devtoInputSchema,
  resources: ["article", "profileLink"],
  capabilities: { refreshable: true, incremental: false },
  fetch: fetchArticles,
  normalize: normalizeArticle,
  profileLinks: devtoProfileLinks,
});

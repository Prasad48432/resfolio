import { httpUrlSchema } from "@resfolio/profile";

import {
  candidateItemSchema,
  type CandidateItem,
} from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * GitHub connector (docs/architecture/12-integrations-and-sync.md) — `oauth2`
 * mode, emits `project` candidates from the user's repositories. `fetch` pages
 * `GET /user/repos` sorted by push recency and uses the cursor (the newest
 * `pushed_at` seen) for cheap incremental refreshes; `normalize` is pure.
 * Contributions are a later resource kind.
 */

/** The subset of the GitHub REST repo object this connector reads. */
export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  created_at: string | null;
  pushed_at: string | null;
  owner: { avatar_url: string | null } | null;
}

const REPOS_URL = "https://api.github.com/user/repos";
const PER_PAGE = 100;

/** The originating provider URL, or undefined if it isn't a real http(s) URL
 * (GitHub `homepage` is free text and frequently junk). */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return httpUrlSchema.safeParse(value).success ? value.trim() : undefined;
}

/** ISO/RFC timestamp → `YYYY-MM-DD` (calendar-date schema), or undefined.
 * Deterministic — no clock. */
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

async function* fetchRepos(
  ctx: FetchContext<undefined>,
): AsyncIterable<GithubRepo> {
  const since = ctx.cursor ? Date.parse(ctx.cursor) : Number.NaN;
  const hasWatermark = !Number.isNaN(since);
  let newestPushed: string | undefined;
  let page = 1;

  while (true) {
    const url = `${REPOS_URL}?per_page=${PER_PAGE}&sort=pushed&direction=desc&page=${page}`;
    const response = await ctx.fetch(url, { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`GitHub /user/repos failed: ${response.status}`);
    }
    const repos = (await response.json()) as GithubRepo[];
    if (repos.length === 0) {
      break;
    }
    for (const repo of repos) {
      if (newestPushed === undefined && repo.pushed_at) {
        newestPushed = repo.pushed_at;
      }
      // Repos arrive newest-push-first: the first one at or before the cursor
      // watermark means every remaining repo is older too — stop the walk.
      if (
        hasWatermark &&
        repo.pushed_at &&
        Date.parse(repo.pushed_at) <= since
      ) {
        if (newestPushed) {
          ctx.setCursor(newestPushed);
        }
        return;
      }
      yield repo;
    }
    if (repos.length < PER_PAGE) {
      break;
    }
    page += 1;
  }

  if (newestPushed) {
    ctx.setCursor(newestPushed);
  }
}

function normalizeRepo(raw: GithubRepo): CandidateItem[] {
  // Forks and archived repos are noise for a portfolio — skip, don't guess.
  if (raw.fork || raw.archived) {
    return [];
  }

  const technologies = [raw.language, ...(raw.topics ?? [])]
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 50);

  const candidate = candidateItemSchema.parse({
    kind: "project",
    externalId: String(raw.id),
    url: safeHttpUrl(raw.homepage) ?? raw.html_url,
    title: raw.name,
    media: raw.owner?.avatar_url
      ? [{ role: "avatar", url: raw.owner.avatar_url }]
      : [],
    metrics: [
      { key: "stars", value: raw.stargazers_count },
      { key: "forks", value: raw.forks_count },
    ],
    raw,
    payload: {
      name: raw.name,
      description: raw.description ?? "",
      url: safeHttpUrl(raw.homepage),
      repoUrl: raw.html_url,
      startDate: toCalendarDate(raw.created_at),
      technologies,
      highlights: [],
    },
  });

  return [candidate];
}

export const github = defineConnector<undefined, GithubRepo>({
  id: "github",
  name: "GitHub",
  authMode: "oauth2",
  tier: "A",
  auth: { scopes: ["read:user", "public_repo"] },
  resources: ["project"],
  capabilities: { incremental: true, webhooks: true },
  schedule: { defaultEvery: "24h" },
  fetch: fetchRepos,
  normalize: normalizeRepo,
});

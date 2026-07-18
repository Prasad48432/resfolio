import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * GitHub connector (docs/architecture/12-integrations-and-sync.md) — `public`
 * mode, emitting `project` candidates from a user's public repositories, plus
 * a `profileLink` for the profile URL itself. It proposes **nothing about the
 * user's identity** — no name, no avatar, no bio, no location: see the
 * "never propose the user's identity" note in `../candidate.ts`.
 *
 * **No OAuth, no GitHub App, no user grant** (V1 decision): the user types a
 * username and `GET /users/{username}/repos` answers. That endpoint returns
 * everything a portfolio project needs, so the OAuth ceremony bought only
 * private repos — content nobody puts on a public profile anyway. `fetch`
 * pages by push recency and uses the cursor (the newest `pushed_at` seen) for
 * cheap incremental refreshes; `normalize` is pure.
 *
 * Anonymous api.github.com is capped at 60 req/hr **per IP** — shared by every
 * user of a deployment, not per user. The runtime lifts that to 5,000 by
 * injecting an optional platform `GITHUB_TOKEN` (`server/env.ts`); this
 * connector neither knows nor cares, per the `FetchContext` contract.
 */

export const githubInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(39)
    // GitHub's own rule: alphanumeric or single hyphens, never leading or
    // trailing. The lookahead is what forbids a trailing/doubled hyphen.
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
      "Use your GitHub username.",
    ),
});

export type GithubInput = z.infer<typeof githubInputSchema>;

/** The subset of the GitHub REST repo object this connector reads. Deliberately
 * narrow (doc 12 §5): only what a Profile project needs — no provider payload
 * tourism. `fork`/`archived` drive the skip, `pushed_at` drives the cursor. */
export interface GithubRepo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string | null;
}

const API_ORIGIN = "https://api.github.com";
const PER_PAGE = 100;

async function* fetchRepos(
  ctx: FetchContext<GithubInput>,
): AsyncIterable<GithubRepo> {
  const since = ctx.cursor ? Date.parse(ctx.cursor) : Number.NaN;
  const hasWatermark = !Number.isNaN(since);
  const base = `${API_ORIGIN}/users/${encodeURIComponent(ctx.input.username)}/repos`;
  let newestPushed: string | undefined;
  let page = 1;

  while (true) {
    const url = `${base}?per_page=${PER_PAGE}&sort=pushed&direction=desc&page=${page}`;
    const response = await ctx.fetch(url, { signal: ctx.signal });
    if (response.status === 404) {
      throw new Error(`No public GitHub user named "${ctx.input.username}".`);
    }
    if (!response.ok) {
      throw new Error(
        `GitHub /users/:username/repos failed: ${response.status}`,
      );
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
    url: raw.html_url,
    title: raw.name,
    media: [],
    metrics: [
      { key: "stars", value: raw.stargazers_count },
      { key: "forks", value: raw.forks_count },
    ],
    raw,
    payload: {
      name: raw.name,
      description: raw.description ?? "",
      repoUrl: raw.html_url,
      technologies,
      highlights: [],
    },
  });

  return [candidate];
}

/** The user's GitHub profile URL — knowable from the username alone, so no
 * request is spent on it and a user with zero public repos still gets their
 * link. Staged as a proposal like everything else; the user imports it. */
function githubProfileLinks(input: GithubInput): CandidateItem[] {
  const url = `https://github.com/${input.username}`;
  return [
    candidateItemSchema.parse({
      kind: "profileLink",
      externalId: "profile-link",
      url,
      title: "GitHub profile",
      raw: null,
      payload: { label: "GitHub", url },
    }),
  ];
}

export const github = defineConnector<GithubInput, GithubRepo>({
  id: "github",
  name: "GitHub",
  authMode: "public",
  tier: "A",
  input: githubInputSchema,
  resources: ["project", "profileLink"],
  capabilities: { refreshable: true, incremental: true },
  fetch: fetchRepos,
  normalize: normalizeRepo,
  profileLinks: githubProfileLinks,
});

import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * Stack Overflow connector (docs/architecture/12-integrations-and-sync.md) —
 * `public` mode over the Stack Exchange API, keyed by the numeric user id.
 * Mapping (doc 12's provider table): top answer tags → one **suggested**
 * `skillGroup` (never assumed into the profile), plus a `profileLink` for the
 * profile URL. Everything else the API returns stays in `raw`.
 *
 * `/users/{id}` is still fetched — not for content, but so a typo'd user id
 * fails loudly at connect time instead of quietly importing nothing. It used to
 * also propose the user's location and avatar; that is gone, along with the
 * whole idea that a connector may describe the user (see `../candidate.ts`).
 */

export const stackoverflowInputSchema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^\d{1,15}$/, "Use your numeric Stack Overflow user id."),
});

export type StackoverflowInput = z.infer<typeof stackoverflowInputSchema>;

/** The subset of `/users/{id}` this connector reads — an existence probe only.
 * Nothing on it reaches the Profile, which is why it is this thin. */
export interface StackoverflowUser {
  user_id: number;
  display_name?: string;
}

/** The subset of `/users/{id}/top-tags` this connector reads. */
export interface StackoverflowTag {
  tag_name: string;
  answer_score?: number;
}

export type StackoverflowRaw = {
  kind: "topTags";
  userId: string;
  tags: StackoverflowTag[];
};

const API_BASE = "https://api.stackexchange.com/2.3";
const SITE = "site=stackoverflow";

async function fetchJson<T>(
  ctx: FetchContext<StackoverflowInput>,
  url: string,
): Promise<T[]> {
  const response = await ctx.fetch(url, { signal: ctx.signal });
  if (!response.ok) {
    throw new Error(`Stack Overflow API failed: ${response.status}`);
  }
  const body = (await response.json()) as { items?: T[] };
  return Array.isArray(body.items) ? body.items : [];
}

async function* fetchProfile(
  ctx: FetchContext<StackoverflowInput>,
): AsyncIterable<StackoverflowRaw> {
  const id = ctx.input.userId;
  // Probe, don't yield: nothing on the user object is importable any more, but
  // a wrong id must still fail here rather than look like an empty profile.
  const [user] = await fetchJson<StackoverflowUser>(
    ctx,
    `${API_BASE}/users/${id}?${SITE}`,
  );
  if (!user) {
    throw new Error(`Stack Overflow user ${id} not found.`);
  }

  const tags = await fetchJson<StackoverflowTag>(
    ctx,
    `${API_BASE}/users/${id}/top-tags?${SITE}&pagesize=30`,
  );
  yield { kind: "topTags", userId: id, tags };
}

/** The user's Stack Overflow profile URL. The id-only form redirects to the
 * slugged one, so this needs no API call and no display name. */
function stackoverflowProfileLinks(input: StackoverflowInput): CandidateItem[] {
  const url = `https://stackoverflow.com/users/${input.userId}`;
  return [
    candidateItemSchema.parse({
      kind: "profileLink",
      externalId: "profile-link",
      url,
      title: "Stack Overflow profile",
      raw: null,
      payload: { label: "Stack Overflow", url },
    }),
  ];
}

function normalizeTopTags(
  raw: Extract<StackoverflowRaw, { kind: "topTags" }>,
): CandidateItem[] {
  const skills = raw.tags
    .map((tag) => tag.tag_name?.trim() ?? "")
    .filter((name) => name.length > 0)
    .map((name) => name.slice(0, 60))
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 50);
  if (skills.length === 0) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "skillGroup",
      externalId: "top-tags",
      title: "Top answer tags",
      // Inferred from answering activity, not declared by the user — always
      // a suggestion (doc 12's mapping table).
      route: { sectionKey: "skills", confidence: "suggested" },
      raw: raw.tags,
      payload: { name: "Stack Overflow", skills },
    }),
  ];
}

function normalizeRaw(raw: StackoverflowRaw): CandidateItem[] {
  switch (raw.kind) {
    case "topTags":
      return normalizeTopTags(raw);
  }
}

export const stackoverflow = defineConnector<
  StackoverflowInput,
  StackoverflowRaw
>({
  id: "stackoverflow",
  name: "Stack Overflow",
  authMode: "public",
  tier: "A",
  input: stackoverflowInputSchema,
  resources: ["skillGroup", "profileLink"],
  capabilities: { refreshable: true, incremental: false },
  fetch: fetchProfile,
  normalize: normalizeRaw,
  profileLinks: stackoverflowProfileLinks,
});

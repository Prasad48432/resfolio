import { z } from "zod";

import { candidateItemSchema, type CandidateItem } from "../candidate";
import { defineConnector, type FetchContext } from "../contract";

/**
 * Stack Overflow connector (docs/architecture/12-integrations-and-sync.md) —
 * `public` mode over the Stack Exchange API, keyed by the numeric user id.
 * Mapping (doc 12's provider table): top answer tags → one **suggested**
 * `skillGroup` (never assumed into the profile), reputation → a metric on a
 * suggested `profileBasics` patch. Everything else the API returns stays in
 * `raw`.
 */

export const stackoverflowInputSchema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^\d{1,15}$/, "Use your numeric Stack Overflow user id."),
});

export type StackoverflowInput = z.infer<typeof stackoverflowInputSchema>;

/** The subset of `/users/{id}` this connector reads. */
export interface StackoverflowUser {
  user_id: number;
  display_name?: string;
  reputation?: number;
  location?: string | null;
  profile_image?: string | null;
  link?: string;
}

/** The subset of `/users/{id}/top-tags` this connector reads. */
export interface StackoverflowTag {
  tag_name: string;
  answer_score?: number;
}

export type StackoverflowRaw =
  | { kind: "user"; user: StackoverflowUser }
  | { kind: "topTags"; userId: string; tags: StackoverflowTag[] };

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
  const [user] = await fetchJson<StackoverflowUser>(
    ctx,
    `${API_BASE}/users/${id}?${SITE}`,
  );
  if (!user) {
    throw new Error(`Stack Overflow user ${id} not found.`);
  }
  yield { kind: "user", user };

  const tags = await fetchJson<StackoverflowTag>(
    ctx,
    `${API_BASE}/users/${id}/top-tags?${SITE}&pagesize=30`,
  );
  yield { kind: "topTags", userId: id, tags };
}

function httpUrlOrUndefined(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeUser(user: StackoverflowUser): CandidateItem[] {
  const reputation = user.reputation;
  const location = user.location?.trim() ?? "";
  const avatarUrl = httpUrlOrUndefined(user.profile_image);
  if (!reputation && !location && !avatarUrl) {
    return [];
  }
  return [
    candidateItemSchema.parse({
      kind: "profileBasics",
      externalId: "profile",
      url: httpUrlOrUndefined(user.link),
      title: "Stack Overflow profile",
      metrics:
        typeof reputation === "number" && reputation >= 0
          ? [{ key: "reputation", value: reputation }]
          : [],
      raw: user,
      // Deliberately no `name`: a Q&A display name should never propose to
      // rename the user's profile. Basics default to `suggested` anyway.
      payload: { location, avatarUrl },
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
    case "user":
      return normalizeUser(raw.user);
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
  resources: ["skillGroup", "profileBasics"],
  capabilities: { refreshable: true, incremental: false },
  fetch: fetchProfile,
  normalize: normalizeRaw,
});

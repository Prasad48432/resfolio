import { describe, expect, it } from "vitest";

import type { FetchContext } from "../contract";
import {
  github,
  githubInputSchema,
  type GithubInput,
  type GithubRepo,
} from "./github";
import {
  archivedRepo,
  bareRepo,
  forkRepo,
  normalRepo,
} from "./github.fixtures";

/** Minimal fake `ctx`: a `fetch` that serves recorded pages keyed by the
 * `page=` query param, plus a captured cursor and the requested URLs. No
 * network. */
function makeCtx(pages: GithubRepo[][], cursor?: string, username = "ada") {
  let saved = cursor;
  const urls: string[] = [];
  const ctx: FetchContext<GithubInput> = {
    input: { username },
    cursor,
    setCursor: (value) => {
      saved = value;
    },
    fetch: ((url: string) => {
      urls.push(String(url));
      const match = /[?&]page=(\d+)/.exec(String(url));
      const page = match ? Number(match[1]) : 1;
      const data = pages[page - 1] ?? [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
      } as Response);
    }) as unknown as typeof fetch,
  };
  return { ctx, getCursor: () => saved, urls };
}

async function collect(iter: AsyncIterable<GithubRepo>): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("github.input", () => {
  it("accepts real GitHub usernames", () => {
    for (const username of ["ada", "a", "torvalds", "my-org-1", "a1-b2-c3"]) {
      expect(githubInputSchema.safeParse({ username }).success).toBe(true);
    }
  });

  it("rejects usernames GitHub itself would reject", () => {
    for (const username of [
      "", // empty
      "-leading", // leading hyphen
      "trailing-", // trailing hyphen
      "double--hyphen", // consecutive hyphens
      "has space",
      "has_underscore",
      "a".repeat(40), // over 39 chars
    ]) {
      expect(githubInputSchema.safeParse({ username }).success).toBe(false);
    }
  });
});

describe("github.normalize", () => {
  it("maps a repo to a project candidate", () => {
    const [candidate] = github.normalize(normalRepo);
    expect(candidate).toBeDefined();
    expect(candidate?.kind).toBe("project");
    expect(candidate?.externalId).toBe("1001");
    expect(candidate?.title).toBe("fluxlog");
    expect(candidate?.url).toBe("https://github.com/ada/fluxlog");
    if (candidate?.kind === "project") {
      expect(candidate.payload.name).toBe("fluxlog");
      expect(candidate.payload.description).toBe(
        "Structured logging for Flux.",
      );
      expect(candidate.payload.repoUrl).toBe("https://github.com/ada/fluxlog");
      // language + topics, de-duplicated (typescript appears in both).
      expect(candidate.payload.technologies).toEqual([
        "TypeScript",
        "logging",
        "observability",
        "typescript",
      ]);
    }
  });

  it("carries star/fork metrics", () => {
    const [candidate] = github.normalize(normalRepo);
    expect(candidate?.metrics).toEqual([
      { key: "stars", value: 2312 },
      { key: "forks", value: 88 },
    ]);
  });

  it("imports only the named fields — no dates, no avatar, no homepage", () => {
    const [candidate] = github.normalize(normalRepo);
    // Doc 12 §5: only the metadata the Profile needs. A repo carries no
    // startDate and no media, so imported projects stay free of provider junk.
    expect(candidate?.media).toEqual([]);
    if (candidate?.kind === "project") {
      expect(candidate.payload.startDate).toBeUndefined();
      expect(candidate.payload.url).toBeUndefined();
    }
  });

  it("proposes nothing about the user — only projects and a link", () => {
    // Users report "the GitHub import changed my avatar/name/summary". It
    // cannot, and this is the guard that keeps it that way.
    const kinds = [
      ...github.normalize(normalRepo),
      ...github.profileLinks!({ username: "ada" }),
    ].map((candidate) => candidate.kind);
    expect(new Set(kinds)).toEqual(new Set(["project", "profileLink"]));
  });

  it("tolerates a repo with nothing optional set", () => {
    const [candidate] = github.normalize(bareRepo);
    expect(candidate?.url).toBe("https://github.com/ada/dotfiles");
    if (candidate?.kind === "project") {
      expect(candidate.payload.description).toBe("");
      expect(candidate.payload.technologies).toEqual([]);
    }
  });

  it("skips forks and archived repos", () => {
    expect(github.normalize(forkRepo)).toEqual([]);
    expect(github.normalize(archivedRepo)).toEqual([]);
  });
});

describe("github.fetch", () => {
  it("reads the public per-user endpoint, not the authenticated one", async () => {
    const { ctx, urls } = makeCtx([[normalRepo]], undefined, "ada");
    await collect(github.fetch(ctx));
    expect(urls[0]).toContain("https://api.github.com/users/ada/repos");
    expect(urls[0]).not.toContain("/user/repos");
  });

  it("escapes the username into the path", async () => {
    const { ctx, urls } = makeCtx([[]], undefined, "a-b");
    await collect(github.fetch(ctx));
    expect(urls[0]).toContain("/users/a-b/repos");
  });

  it("pages until a short page and sets the cursor to the newest push", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      ...normalRepo,
      id: 2000 + i,
      pushed_at: `2024-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const page2 = [
      { ...normalRepo, id: 2999, pushed_at: "2020-01-01T00:00:00Z" },
    ];
    const { ctx, getCursor } = makeCtx([page1, page2]);

    const repos = await collect(github.fetch(ctx));
    expect(repos).toHaveLength(101);
    // Cursor = the newest pushed_at seen (the first repo of page 1).
    expect(getCursor()).toBe(page1[0]?.pushed_at);
  });

  it("stops early at the cursor watermark (incremental)", async () => {
    const page1 = [
      { ...normalRepo, id: 3001, pushed_at: "2024-06-10T00:00:00Z" },
      { ...normalRepo, id: 3002, pushed_at: "2024-06-05T00:00:00Z" },
      { ...normalRepo, id: 3003, pushed_at: "2024-06-01T00:00:00Z" },
    ];
    // Watermark between the 1st and 2nd repo — only the newest is fresh.
    const { ctx, getCursor } = makeCtx([page1], "2024-06-07T00:00:00Z");

    const repos = await collect(github.fetch(ctx));
    expect(repos.map((r) => r.id)).toEqual([3001]);
    expect(getCursor()).toBe("2024-06-10T00:00:00Z");
  });

  it("names the user on a 404 rather than leaking the status", async () => {
    const ctx: FetchContext<GithubInput> = {
      input: { username: "nobody" },
      cursor: undefined,
      setCursor: () => {},
      fetch: (() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)) as unknown as typeof fetch,
    };
    await expect(collect(github.fetch(ctx))).rejects.toThrow(
      /No public GitHub user named "nobody"/,
    );
  });

  it("throws on a non-ok response", async () => {
    const ctx: FetchContext<GithubInput> = {
      input: { username: "ada" },
      cursor: undefined,
      setCursor: () => {},
      fetch: (() =>
        Promise.resolve({
          ok: false,
          status: 403,
        } as Response)) as unknown as typeof fetch,
    };
    await expect(collect(github.fetch(ctx))).rejects.toThrow(/403/);
  });
});

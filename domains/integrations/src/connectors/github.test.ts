import { describe, expect, it } from "vitest";

import type { FetchContext } from "../contract";
import { github, type GithubRepo } from "./github";
import {
  archivedRepo,
  forkRepo,
  junkHomepageRepo,
  normalRepo,
} from "./github.fixtures";

/** Minimal fake `ctx`: a `fetch` that serves recorded pages keyed by the
 * `page=` query param, plus a captured cursor. No network. */
function makeCtx(pages: GithubRepo[][], cursor?: string) {
  let saved = cursor;
  const ctx: FetchContext<undefined> = {
    input: undefined,
    cursor,
    setCursor: (value) => {
      saved = value;
    },
    fetch: ((url: string) => {
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
  return { ctx, getCursor: () => saved };
}

async function collect(iter: AsyncIterable<GithubRepo>): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("github.normalize", () => {
  it("maps a repo to a project candidate", () => {
    const [candidate] = github.normalize(normalRepo);
    expect(candidate).toBeDefined();
    expect(candidate?.kind).toBe("project");
    expect(candidate?.externalId).toBe("1001");
    expect(candidate?.title).toBe("fluxlog");
    // homepage is the canonical link when valid; repoUrl is the repo itself.
    expect(candidate?.url).toBe("https://fluxlog.dev");
    if (candidate?.kind === "project") {
      expect(candidate.payload.name).toBe("fluxlog");
      expect(candidate.payload.description).toBe("Structured logging for Flux.");
      expect(candidate.payload.url).toBe("https://fluxlog.dev");
      expect(candidate.payload.repoUrl).toBe("https://github.com/ada/fluxlog");
      expect(candidate.payload.startDate).toBe("2021-03-04");
      // language + topics, de-duplicated (typescript appears in both).
      expect(candidate.payload.technologies).toEqual([
        "TypeScript",
        "logging",
        "observability",
        "typescript",
      ]);
    }
  });

  it("carries star/fork metrics and the owner avatar as media", () => {
    const [candidate] = github.normalize(normalRepo);
    expect(candidate?.metrics).toEqual([
      { key: "stars", value: 2312 },
      { key: "forks", value: 88 },
    ]);
    expect(candidate?.media).toEqual([
      { role: "avatar", url: "https://avatars.githubusercontent.com/u/42" },
    ]);
  });

  it("drops a junk homepage and falls back to the repo URL", () => {
    const [candidate] = github.normalize(junkHomepageRepo);
    expect(candidate?.url).toBe("https://github.com/ada/dotfiles");
    if (candidate?.kind === "project") {
      expect(candidate.payload.url).toBeUndefined();
      expect(candidate.payload.description).toBe("");
      expect(candidate.payload.technologies).toEqual([]);
    }
    expect(candidate?.media).toEqual([]);
  });

  it("skips forks and archived repos", () => {
    expect(github.normalize(forkRepo)).toEqual([]);
    expect(github.normalize(archivedRepo)).toEqual([]);
  });
});

describe("github.fetch", () => {
  it("pages until a short page and sets the cursor to the newest push", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      ...normalRepo,
      id: 2000 + i,
      pushed_at: `2024-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const page2 = [{ ...normalRepo, id: 2999, pushed_at: "2020-01-01T00:00:00Z" }];
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

  it("throws on a non-ok response", async () => {
    const ctx: FetchContext<undefined> = {
      input: undefined,
      cursor: undefined,
      setCursor: () => {},
      fetch: (() =>
        Promise.resolve({ ok: false, status: 401 } as Response)) as unknown as typeof fetch,
    };
    await expect(collect(github.fetch(ctx))).rejects.toThrow(/401/);
  });
});

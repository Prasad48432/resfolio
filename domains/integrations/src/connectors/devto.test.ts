import { describe, expect, it } from "vitest";

import type { FetchContext } from "../contract";
import { devto, type DevtoArticle, type DevtoInput } from "./devto";
import { devtoArticles } from "./devto.fixtures";

/** A fake paged API: page 1 → the fixture list, later pages → empty. */
function makeCtx(
  pages: Record<number, DevtoArticle[]>,
  requested: string[] = [],
): FetchContext<DevtoInput> {
  return {
    input: { username: "ada" },
    cursor: undefined,
    setCursor: () => {},
    fetch: ((input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(pages[page] ?? []),
      } as Response);
    }) as unknown as typeof fetch,
  };
}

async function collect(
  iter: AsyncIterable<DevtoArticle>,
): Promise<DevtoArticle[]> {
  const out: DevtoArticle[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("devto.fetch", () => {
  it("pages the public articles endpoint by username", async () => {
    const requested: string[] = [];
    const articles = await collect(
      devto.fetch(makeCtx({ 1: devtoArticles }, requested)),
    );
    expect(articles).toHaveLength(3);
    expect(requested[0]).toContain("username=ada");
    // A short page ends the walk — no second request.
    expect(requested).toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    const ctx: FetchContext<DevtoInput> = {
      input: { username: "ada" },
      cursor: undefined,
      setCursor: () => {},
      fetch: (() =>
        Promise.resolve({ ok: false, status: 429 } as Response)) as unknown as typeof fetch,
    };
    await expect(collect(devto.fetch(ctx))).rejects.toThrow(/429/);
  });
});

describe("devto.normalize", () => {
  it("maps an article with reactions as a metric", () => {
    const [candidate] = devto.normalize(devtoArticles[0]!);
    expect(candidate?.kind).toBe("article");
    expect(candidate?.externalId).toBe("180042");
    expect(candidate?.metrics).toEqual([{ key: "reactions", value: 214 }]);
    if (candidate?.kind === "article") {
      expect(candidate.payload.title).toBe(
        "Postgres Row-Level Security in Practice",
      );
      expect(candidate.payload.publisher).toBe("DEV Community");
      expect(candidate.payload.date).toBe("2026-05-11");
      expect(candidate.payload.summary).toBe(
        "What RLS actually buys you, and where it bites.",
      );
    }
  });

  it("tolerates the string tag_list shape and an empty description", () => {
    const [candidate] = devto.normalize(devtoArticles[1]!);
    if (candidate?.kind === "article") {
      expect(candidate.payload.summary).toBe("");
      expect(candidate.payload.date).toBe("2026-03-02");
    }
  });

  it("skips a row with a blank title", () => {
    expect(devto.normalize(devtoArticles[2]!)).toEqual([]);
  });
});

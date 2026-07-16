import { describe, expect, it } from "vitest";

import { richTextSchema } from "@resfolio/profile";

import type { FetchContext } from "../contract";
import { parseFeed, rss, type RssInput, type RssRawEntry } from "./rss";
import { atomFeed, rssFeed } from "./rss.fixtures";

function makeCtx(body: string, ok = true, status = 200): FetchContext<RssInput> {
  return {
    input: { feedUrl: "https://ada.example/feed.xml" },
    cursor: undefined,
    setCursor: () => {},
    fetch: (() =>
      Promise.resolve({
        ok,
        status,
        text: () => Promise.resolve(body),
      } as Response)) as unknown as typeof fetch,
  };
}

async function collect(
  iter: AsyncIterable<RssRawEntry>,
): Promise<RssRawEntry[]> {
  const out: RssRawEntry[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("parseFeed", () => {
  it("parses an RSS 2.0 feed into flattened entries", () => {
    const entries = parseFeed(rssFeed);
    expect(entries).toHaveLength(2);
    const [first] = entries;
    expect(first?.feedTitle).toBe("Ada's Notes");
    expect(first?.title).toBe("On Structured Logging");
    expect(first?.link).toBe("https://ada.example/blog/structured-logging");
    expect(first?.id).toBe("post-42");
    expect(first?.published).toBe("Mon, 03 Jun 2024 09:00:00 GMT");
  });

  it("parses an Atom feed, taking the href off the alternate link", () => {
    const entries = parseFeed(atomFeed);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry?.feedTitle).toBe("Jun's Journal");
    expect(entry?.title).toBe("Designing for Trust");
    expect(entry?.link).toBe("https://jun.example/trust");
    expect(entry?.id).toBe("tag:jun.example,2024:/trust");
    expect(entry?.published).toBe("2024-05-20T14:00:00Z");
  });

  it("returns [] for a body that is neither RSS nor Atom", () => {
    expect(parseFeed("<html><body>nope</body></html>")).toEqual([]);
  });
});

describe("rss.normalize", () => {
  it("maps an RSS entry to an article candidate with plain-text summary", () => {
    const [entry] = parseFeed(rssFeed);
    const [candidate] = rss.normalize(entry!);
    expect(candidate?.kind).toBe("article");
    expect(candidate?.externalId).toBe("post-42");
    expect(candidate?.url).toBe("https://ada.example/blog/structured-logging");
    if (candidate?.kind === "article") {
      expect(candidate.payload.title).toBe("On Structured Logging");
      expect(candidate.payload.publisher).toBe("Ada's Notes");
      expect(candidate.payload.date).toBe("2024-06-03");
      // HTML in the description is stripped to plain text (doc 01/10).
      expect(candidate.payload.summary).toBe("Why structure beats grep.");
      expect(() => richTextSchema.parse(candidate.payload.summary)).not.toThrow();
    }
  });

  it("maps an Atom entry", () => {
    const [entry] = parseFeed(atomFeed);
    const [candidate] = rss.normalize(entry!);
    if (candidate?.kind === "article") {
      expect(candidate.payload.title).toBe("Designing for Trust");
      expect(candidate.payload.publisher).toBe("Jun's Journal");
      expect(candidate.payload.date).toBe("2024-05-20");
      expect(candidate.payload.summary).toBe(
        "Notes on review-first product design.",
      );
    }
  });

  it("skips an entry with no title", () => {
    const entry: RssRawEntry = { feedTitle: "X", title: "  ", id: "x" };
    expect(rss.normalize(entry)).toEqual([]);
  });
});

describe("rss.fetch", () => {
  it("yields entries parsed from the fetched body", async () => {
    const entries = await collect(rss.fetch(makeCtx(rssFeed)));
    expect(entries.map((e) => e.title)).toEqual([
      "On Structured Logging",
      "Quiet Interfaces",
    ]);
  });

  it("throws on a non-ok response", async () => {
    await expect(collect(rss.fetch(makeCtx("", false, 404)))).rejects.toThrow(
      /404/,
    );
  });
});

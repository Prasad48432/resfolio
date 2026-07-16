import { describe, expect, it } from "vitest";

import type { FetchContext } from "../contract";
import {
  stackoverflow,
  type StackoverflowInput,
  type StackoverflowRaw,
} from "./stackoverflow";
import {
  stackoverflowTopTags,
  stackoverflowUser,
} from "./stackoverflow.fixtures";

function makeCtx(
  responses: Record<string, unknown>,
): FetchContext<StackoverflowInput> {
  return {
    input: { userId: "22656" },
    cursor: undefined,
    setCursor: () => {},
    fetch: ((input: RequestInfo | URL) => {
      const url = String(input);
      const key = Object.keys(responses).find((fragment) =>
        url.includes(fragment),
      );
      if (!key) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responses[key]),
      } as Response);
    }) as unknown as typeof fetch,
  };
}

async function collect(
  iter: AsyncIterable<StackoverflowRaw>,
): Promise<StackoverflowRaw[]> {
  const out: StackoverflowRaw[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe("stackoverflow.fetch", () => {
  it("yields the user then the top tags", async () => {
    const raws = await collect(
      stackoverflow.fetch(
        makeCtx({
          "/top-tags?": { items: stackoverflowTopTags },
          "/users/22656?": { items: [stackoverflowUser] },
        }),
      ),
    );
    expect(raws.map((raw) => raw.kind)).toEqual(["user", "topTags"]);
  });

  it("throws when the user does not exist", async () => {
    await expect(
      collect(
        stackoverflow.fetch(
          makeCtx({
            "/users/22656?": { items: [] },
            "/top-tags?": { items: [] },
          }),
        ),
      ),
    ).rejects.toThrow(/not found/);
  });
});

describe("stackoverflow.normalize", () => {
  it("user → a suggested basics patch with reputation as a metric, never a name", () => {
    const [candidate] = stackoverflow.normalize({
      kind: "user",
      user: stackoverflowUser,
    });
    expect(candidate?.kind).toBe("profileBasics");
    expect(candidate?.metrics).toEqual([{ key: "reputation", value: 41230 }]);
    if (candidate?.kind === "profileBasics") {
      expect(candidate.payload.location).toBe("Berlin, Germany");
      expect(candidate.payload.avatarUrl).toBe(
        "https://i.sstatic.net/abc123.jpg",
      );
      // A Q&A display name must never propose renaming the profile — the
      // schema default "" is dropped by buildBasicsPatch at import.
      expect(candidate.payload.name).toBe("");
    }
  });

  it("top tags → one deduplicated skillGroup routed as suggested", () => {
    const [candidate] = stackoverflow.normalize({
      kind: "topTags",
      userId: "22656",
      tags: stackoverflowTopTags,
    });
    expect(candidate?.kind).toBe("skillGroup");
    expect(candidate?.route).toEqual({
      sectionKey: "skills",
      confidence: "suggested",
    });
    if (candidate?.kind === "skillGroup") {
      expect(candidate.payload.skills).toEqual([
        "postgresql",
        "typescript",
        "node.js",
      ]);
    }
  });

  it("returns [] when there is nothing worth proposing", () => {
    expect(
      stackoverflow.normalize({
        kind: "user",
        user: { user_id: 1, display_name: "x" },
      }),
    ).toEqual([]);
    expect(
      stackoverflow.normalize({ kind: "topTags", userId: "1", tags: [] }),
    ).toEqual([]);
  });
});

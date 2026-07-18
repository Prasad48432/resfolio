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
  it("yields only the top tags — the user object is an existence probe", async () => {
    const raws = await collect(
      stackoverflow.fetch(
        makeCtx({
          "/top-tags?": { items: stackoverflowTopTags },
          "/users/22656?": { items: [stackoverflowUser] },
        }),
      ),
    );
    expect(raws.map((raw) => raw.kind)).toEqual(["topTags"]);
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

describe("stackoverflow.profileLinks", () => {
  it("derives the profile URL from the user id alone — no fetch", () => {
    const [candidate] = stackoverflow.profileLinks!({ userId: "22656" });
    expect(candidate?.kind).toBe("profileLink");
    if (candidate?.kind === "profileLink") {
      expect(candidate.payload).toEqual({
        label: "Stack Overflow",
        url: "https://stackoverflow.com/users/22656",
      });
    }
  });
});

describe("stackoverflow.normalize", () => {
  it("proposes nothing about the user's identity", () => {
    const candidates = [
      ...stackoverflow.normalize({
        kind: "topTags",
        userId: "22656",
        tags: stackoverflowTopTags,
      }),
      ...stackoverflow.profileLinks!({ userId: "22656" }),
    ];
    // The regression this guards: SO used to propose the user's location and
    // avatar. `name` is deliberately not on this list — `skillGroup.payload.name`
    // is the group's own label ("Stack Overflow"), not the user's name.
    for (const candidate of candidates) {
      const payload = candidate.payload as Record<string, unknown>;
      expect(payload["headline"]).toBeUndefined();
      expect(payload["summary"]).toBeUndefined();
      expect(payload["location"]).toBeUndefined();
      expect(payload["avatarUrl"]).toBeUndefined();
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
      stackoverflow.normalize({ kind: "topTags", userId: "1", tags: [] }),
    ).toEqual([]);
  });
});

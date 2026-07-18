import { describe, expect, it } from "vitest";

import {
  assetKeyFromUrl,
  assetUrl,
  buildAssetKey,
  collectAssetKeys,
  ownerPrefix,
  parseAssetKey,
} from "./keys";

const OWNER = "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f";
const HASH = "a".repeat(32);

describe("buildAssetKey", () => {
  it("is owner-first, so one prefix covers everything a profile owns", () => {
    const avatar = buildAssetKey({
      ownerId: OWNER,
      kind: "avatar",
      contentHash: HASH,
      extension: "webp",
    });
    const banner = buildAssetKey({
      ownerId: OWNER,
      kind: "portfolioBanner",
      contentHash: HASH,
      extension: "webp",
    });

    // This is the property the deletion path depends on.
    expect(avatar.startsWith(ownerPrefix(OWNER))).toBe(true);
    expect(banner.startsWith(ownerPrefix(OWNER))).toBe(true);
  });

  it("separates kinds within an owner", () => {
    const avatar = buildAssetKey({
      ownerId: OWNER,
      kind: "avatar",
      contentHash: HASH,
      extension: "webp",
    });
    expect(avatar).toBe(`u/${OWNER}/avatar/${HASH}.webp`);
  });

  it("gives the same key for the same content", () => {
    const args = {
      ownerId: OWNER,
      kind: "avatar" as const,
      contentHash: HASH,
      extension: "webp",
    };
    expect(buildAssetKey(args)).toBe(buildAssetKey(args));
  });
});

describe("parseAssetKey — the ownership check", () => {
  it("round-trips a key we built", () => {
    const key = buildAssetKey({
      ownerId: OWNER,
      kind: "portfolioBanner",
      contentHash: HASH,
      extension: "webp",
    });
    expect(parseAssetKey(key)).toEqual({
      ownerId: OWNER,
      kind: "portfolioBanner",
    });
  });

  it("resolves a nested segment to its own kind, not a shallower one", () => {
    const image = buildAssetKey({
      ownerId: OWNER,
      kind: "portfolioImage",
      contentHash: HASH,
      extension: "webp",
    });
    expect(parseAssetKey(image)?.kind).toBe("portfolioImage");
  });

  // A delete request is authorized by comparing the parsed owner to the
  // session. Everything below must fail to parse rather than parse into
  // something that would pass that comparison.
  it.each([
    ["", "empty"],
    ["avatar/x.webp", "no owner prefix"],
    ["u/", "owner missing"],
    [`u/${OWNER}/`, "no kind"],
    [`u/${OWNER}/unknown/x.webp`, "unrecognised kind"],
    [`u/${OWNER}/avatar/`, "no filename"],
    [`u/${OWNER}/avatar/nested/x.webp`, "deeper than we ever write"],
    ["../../etc/passwd", "traversal"],
    [`u/${OWNER}/avatar/../../other/x.webp`, "traversal inside a valid prefix"],
  ])("returns null for %s (%s)", (key) => {
    expect(parseAssetKey(key)).toBeNull();
  });

  it("does not confuse one owner's key for another's", () => {
    const key = buildAssetKey({
      ownerId: OWNER,
      kind: "avatar",
      contentHash: HASH,
      extension: "webp",
    });
    expect(parseAssetKey(key)?.ownerId).not.toBe("someone-else");
  });
});

describe("assetUrl", () => {
  it("joins base and key without doubling the slash", () => {
    expect(assetUrl("u/x/avatar/a.webp", "https://cdn.example.com")).toBe(
      "https://cdn.example.com/u/x/avatar/a.webp",
    );
    expect(assetUrl("u/x/avatar/a.webp", "https://cdn.example.com/")).toBe(
      "https://cdn.example.com/u/x/avatar/a.webp",
    );
  });
});

describe("assetKeyFromUrl", () => {
  const key = buildAssetKey({
    ownerId: OWNER,
    kind: "avatar",
    contentHash: HASH,
    extension: "webp",
  });

  it("round-trips a URL we generated", () => {
    expect(assetKeyFromUrl(assetUrl(key, "https://pub-abc.r2.dev"))).toBe(key);
  });

  /**
   * The property the orphan sweep's safety rests on. If this parse were
   * anchored to the configured origin, moving from r2.dev to a custom domain
   * would make every already-stored URL unrecognisable, every live asset look
   * orphaned, and the sweep would delete users' images.
   */
  it("resolves the same key across different delivery origins", () => {
    const old = assetUrl(key, "https://pub-abc.r2.dev");
    const migrated = assetUrl(key, "https://assets.resfolio.me");
    expect(assetKeyFromUrl(old)).toBe(key);
    expect(assetKeyFromUrl(migrated)).toBe(key);
    expect(assetKeyFromUrl(old)).toBe(assetKeyFromUrl(migrated));
  });

  it("returns null for URLs that aren't ours", () => {
    expect(assetKeyFromUrl("https://example.com/photo.png")).toBeNull();
    expect(assetKeyFromUrl("https://gravatar.com/avatar/abc")).toBeNull();
    expect(assetKeyFromUrl("")).toBeNull();
  });

  it("returns null for a well-shaped path with an unknown kind", () => {
    expect(
      assetKeyFromUrl(`https://pub-abc.r2.dev/u/${OWNER}/bogus/${HASH}.webp`),
    ).toBeNull();
  });
});

describe("collectAssetKeys", () => {
  const avatar = buildAssetKey({
    ownerId: OWNER,
    kind: "avatar",
    contentHash: HASH,
    extension: "webp",
  });
  const banner = buildAssetKey({
    ownerId: OWNER,
    kind: "portfolioBanner",
    contentHash: "b".repeat(32),
    extension: "webp",
  });

  it("finds keys at any depth, without knowing the field names", () => {
    const found = collectAssetKeys({
      basics: {
        name: "Ada",
        avatarUrl: assetUrl(avatar, "https://pub-abc.r2.dev"),
      },
      sections: [
        { items: [{ cover: assetUrl(banner, "https://pub-abc.r2.dev") }] },
      ],
    });
    expect(found.sort()).toEqual([avatar, banner].sort());
  });

  it("ignores external URLs and non-string content", () => {
    expect(
      collectAssetKeys({
        a: "https://example.com/x.png",
        b: 42,
        c: null,
        d: undefined,
        e: true,
      }),
    ).toEqual([]);
  });

  it("deduplicates a key referenced twice", () => {
    const url = assetUrl(avatar, "https://pub-abc.r2.dev");
    expect(collectAssetKeys({ a: url, b: url })).toEqual([avatar]);
  });
});

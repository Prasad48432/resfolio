import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  keyringFromHex,
  type TokenKeyring,
} from "./crypto";
import { TokenCryptoError } from "./errors";

/**
 * Token encryption at rest (doc 12): AES-256-GCM round-trip, authenticated
 * tamper rejection, and the key-version prefix that keeps rotation possible.
 * Pure over an explicit keyring — no env, no database.
 */

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("keyringFromHex", () => {
  it("accepts 64 hex chars", () => {
    const ring = keyringFromHex(KEY_A);
    expect(ring.current).toBe(1);
    expect(ring.keys[1]?.length).toBe(32);
  });

  it.each(["short", "g".repeat(64), "a".repeat(63)])("rejects %s", (bad) => {
    expect(() => keyringFromHex(bad)).toThrow(TokenCryptoError);
  });
});

describe("encryptSecret / decryptSecret", () => {
  const ring = keyringFromHex(KEY_A);

  it("round-trips a token", () => {
    const envelope = encryptSecret("gho_secret_token", ring);
    expect(envelope.startsWith("v1.")).toBe(true);
    expect(envelope).not.toContain("gho_secret_token");
    expect(decryptSecret(envelope, ring)).toBe("gho_secret_token");
  });

  it("uses a fresh IV per encryption (identical plaintexts differ)", () => {
    expect(encryptSecret("same", ring)).not.toBe(encryptSecret("same", ring));
  });

  it("rejects a tampered ciphertext (GCM authentication)", () => {
    const envelope = encryptSecret("secret", ring);
    const parts = envelope.split(".");
    const body = parts[3] as string;
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    const tampered = [parts[0], parts[1], parts[2], flipped].join(".");
    expect(() => decryptSecret(tampered, ring)).toThrow(TokenCryptoError);
  });

  it("rejects the wrong key", () => {
    const envelope = encryptSecret("secret", ring);
    expect(() => decryptSecret(envelope, keyringFromHex(KEY_B))).toThrow(
      TokenCryptoError,
    );
  });

  it.each(["", "v1.only.three", "nope.a.b.c"])(
    "rejects malformed envelope %j",
    (bad) => {
      expect(() => decryptSecret(bad, ring)).toThrow(TokenCryptoError);
    },
  );

  it("rotation: v1 envelopes still decrypt under a v2-current keyring", () => {
    const v1Envelope = encryptSecret("old-token", ring);
    const rotated: TokenKeyring = {
      current: 2,
      keys: {
        1: ring.keys[1] as Buffer,
        2: keyringFromHex(KEY_B).keys[1] as Buffer,
      },
    };
    // Old rows decrypt with v1; new encryptions carry v2.
    expect(decryptSecret(v1Envelope, rotated)).toBe("old-token");
    expect(encryptSecret("new-token", rotated).startsWith("v2.")).toBe(true);
    // A version nobody holds fails loudly.
    expect(() =>
      decryptSecret(v1Envelope.replace(/^v1/, "v9"), rotated),
    ).toThrow(TokenCryptoError);
  });
});

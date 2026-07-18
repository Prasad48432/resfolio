import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { TokenCryptoError } from "./errors";

/**
 * Provider-token encryption at rest (docs/architecture/12-integrations-and-sync.md,
 * 10-auth-and-security.md): AES-256-GCM, per-value random IV, authenticated —
 * a tampered envelope fails decryption instead of yielding garbage. The
 * envelope is version-prefixed (`v1.<iv>.<tag>.<ciphertext>`, base64url) so a
 * future key rotation can add key v2 while v1 still decrypts old rows (the
 * doc-12 key-version byte, kept as a prefix for legibility).
 *
 * Pure over an explicit `TokenKeyring` — no env access here — so round-trip,
 * tamper, and rotation behavior are unit-testable. `./repository` builds the
 * keyring from validated env.
 */

export interface TokenKeyring {
  /** The key version new encryptions use. */
  current: number;
  /** Every version that may still decrypt stored envelopes. */
  keys: Record<number, Buffer>;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;

/** A 64-hex-char string → a v1 keyring (the single-key case). */
export function keyringFromHex(hex: string, version = 1): TokenKeyring {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new TokenCryptoError(
      "Token key must be 64 hex characters (32 bytes).",
    );
  }
  return { current: version, keys: { [version]: Buffer.from(hex, "hex") } };
}

function keyFor(keyring: TokenKeyring, version: number): Buffer {
  const key = keyring.keys[version];
  if (!key || key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `No ${KEY_BYTES}-byte key for version ${version}.`,
    );
  }
  return key;
}

/** Encrypt a secret with the keyring's current key. */
export function encryptSecret(
  plaintext: string,
  keyring: TokenKeyring,
): string {
  const key = keyFor(keyring, keyring.current);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    `v${keyring.current}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt an envelope with whichever key version it names. */
export function decryptSecret(envelope: string, keyring: TokenKeyring): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || !/^v\d+$/.test(parts[0] as string)) {
    throw new TokenCryptoError("Malformed token envelope.");
  }
  const version = Number((parts[0] as string).slice(1));
  const key = keyFor(keyring, version);
  const iv = Buffer.from(parts[1] as string, "base64url");
  const tag = Buffer.from(parts[2] as string, "base64url");
  const ciphertext = Buffer.from(parts[3] as string, "base64url");
  if (iv.length !== IV_BYTES) {
    throw new TokenCryptoError("Malformed token envelope.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered ciphertext — GCM authentication failed. Never
    // include crypto internals in the message.
    throw new TokenCryptoError("Token decryption failed.");
  }
}

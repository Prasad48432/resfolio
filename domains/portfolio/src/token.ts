import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * Signed, short-lived capability tokens for a private portfolio **draft**
 * surface (docs/architecture/08-dashboard-ux.md, 09-rendering-pipeline.md).
 *
 * Stateless HMAC-SHA256 over a `{ source: "draft", ref: userId, exp }` payload.
 * Server-only (`node:crypto`); never bundle into a client.
 *
 * **Currently unused — parked, not dead (2026-07-18.)** Its only consumer was
 * the iframed draft-preview route, removed when re-rendering the whole
 * portfolio app on every keystroke proved the wrong shape to keep paying for.
 * It is kept because the preview system that replaces it will need exactly
 * this: any owner-only draft surface a *browser* must load — an iframe, an
 * `<img>` pointing at a screenshot service — needs a capability in the URL,
 * and this one is written and tested. Server-to-server calls
 * (`/api/revalidate`, PDF export) use the plain `RENDER_SECRET` bearer
 * instead; no token is needed when no browser is involved.
 *
 * If the new preview lands without needing it, delete this file and its test
 * rather than leaving it here indefinitely.
 */

export const previewTokenPayloadSchema = z.object({
  /** The draft is always the preview source; `ref` is the owning `userId`. */
  source: z.literal("draft"),
  ref: z.string().min(1),
  /** Expiry, epoch milliseconds. */
  exp: z.number().int(),
});
export type PreviewTokenPayload = z.infer<typeof previewTokenPayloadSchema>;
export type PreviewTokenInput = Omit<PreviewTokenPayload, "exp">;

export class InvalidPreviewTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid preview token: ${reason}`);
    this.name = "InvalidPreviewTokenError";
  }
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signPreviewToken(
  payload: PreviewTokenPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

/** Sign a payload, stamping a fresh expiry `ttlMs` from now. */
export function mintPreviewToken(
  input: PreviewTokenInput,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  return signPreviewToken({ ...input, exp: Date.now() + ttlMs }, secret);
}

/** Verify signature, decode, validate shape, and check expiry. */
export function verifyPreviewToken(
  token: string,
  secret: string,
): PreviewTokenPayload {
  const dot = token.indexOf(".");
  if (dot <= 0) {
    throw new InvalidPreviewTokenError("malformed");
  }
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = hmac(body, secret);
  const provided = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    provided.length !== expectedBuf.length ||
    !timingSafeEqual(provided, expectedBuf)
  ) {
    throw new InvalidPreviewTokenError("bad signature");
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new InvalidPreviewTokenError("undecodable payload");
  }

  const parsed = previewTokenPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidPreviewTokenError("invalid payload shape");
  }
  if (parsed.data.exp < Date.now()) {
    throw new InvalidPreviewTokenError("expired");
  }
  return parsed.data;
}

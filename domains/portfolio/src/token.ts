import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * Signed, short-lived tokens that guard the private portfolio **draft-preview**
 * route (docs/architecture/08-dashboard-ux.md, 09-rendering-pipeline.md). The
 * dashboard mints one for the signed-in owner; `apps/sites` verifies it before
 * rendering that user's *draft* portfolio inside the editor iframe — the "never
 * edit blindly" split workspace, rendered by the real template.
 *
 * Stateless HMAC-SHA256, mirroring `@resfolio/document/token` but with a
 * portfolio-shaped payload (no `document` — a portfolio renders the whole
 * profile through the user's Site). Server-only (`node:crypto`); never bundle
 * into a client. The two domains keep independent token modules so neither
 * depends on the other.
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

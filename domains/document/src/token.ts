import { createHmac, timingSafeEqual } from "node:crypto";

import { viewDefinitionSchema } from "@resfolio/profile";
import { z } from "zod";

/**
 * Signed, short-lived render tokens that guard the private print/preview routes
 * (docs/architecture/02-resume-rendering.md, 09-rendering-pipeline.md).
 * Stateless HMAC-SHA256 over the payload — the Redis nonce hardening from
 * doc 07 layers on later without changing this interface.
 *
 * Shared by every minter and verifier so the signing scheme lives in exactly
 * one place: `apps/sites` verifies; the dashboard and the export scripts mint.
 * Server-only (imports `node:crypto`) — never bundle into a client; import
 * document *types* from `@resfolio/document` instead.
 *
 * The token names a profile snapshot (`source`/`ref`) and how to render it
 * (`document`): either an **inline** spec (the fixture/dev + export-script path,
 * needs no database) or a **stored** document id the render host looks up
 * (the dashboard/product path).
 */

export const renderSourceSchema = z.enum(["fixture", "draft", "version"]);
export type RenderSource = z.infer<typeof renderSourceSchema>;

export const renderDocumentRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inline"),
    templateId: z.string().min(1),
    /** Template presentation config (re-validated by the template at render). */
    config: z.record(z.string(), z.unknown()).default({}),
    /** The Document's selection/order/deltas, applied by `buildProfileView`. */
    view: viewDefinitionSchema.optional(),
  }),
  z.object({
    kind: z.literal("stored"),
    /** A `documents` row id; the render host resolves templateId/config/view. */
    id: z.string().min(1),
  }),
]);
export type RenderDocumentRef = z.infer<typeof renderDocumentRefSchema>;

export const renderTokenPayloadSchema = z.object({
  /** Where the profile comes from: a fixture (dev/CI), the user's draft, or a
   * published version. `ref` is the fixture key or the owning `userId`. */
  source: renderSourceSchema,
  ref: z.string().min(1),
  document: renderDocumentRefSchema,
  /** Expiry, epoch milliseconds. */
  exp: z.number().int(),
});

export type RenderTokenPayload = z.infer<typeof renderTokenPayloadSchema>;
export type RenderTokenInput = Omit<RenderTokenPayload, "exp">;

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid render token: ${reason}`);
    this.name = "InvalidTokenError";
  }
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Sign a payload that already carries its own `exp`. */
export function signRenderToken(
  payload: RenderTokenPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

/** Sign a payload, stamping a fresh expiry `ttlMs` from now. */
export function mintRenderToken(
  input: RenderTokenInput,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  return signRenderToken({ ...input, exp: Date.now() + ttlMs }, secret);
}

/** Verify signature, decode, validate shape, and check expiry. */
export function verifyRenderToken(
  token: string,
  secret: string,
): RenderTokenPayload {
  const dot = token.indexOf(".");
  if (dot <= 0) {
    throw new InvalidTokenError("malformed");
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
    throw new InvalidTokenError("bad signature");
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new InvalidTokenError("undecodable payload");
  }

  const parsed = renderTokenPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidTokenError("invalid payload shape");
  }
  if (parsed.data.exp < Date.now()) {
    throw new InvalidTokenError("expired");
  }
  return parsed.data;
}

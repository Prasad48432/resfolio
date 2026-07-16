import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InvalidTokenError,
  mintRenderToken,
  signRenderToken,
  verifyRenderToken,
  type RenderTokenInput,
} from "./token";

const SECRET = "test-secret-at-least-16-chars";

const inlineInput: RenderTokenInput = {
  source: "fixture",
  ref: "ada",
  document: {
    kind: "inline",
    templateId: "resume-classic",
    config: { pageSize: "A4" },
  },
};

const storedInput: RenderTokenInput = {
  source: "draft",
  ref: "user_123",
  document: { kind: "stored", id: "doc_abc" },
};

describe("render token", () => {
  it("round-trips an inline payload", () => {
    const token = mintRenderToken(inlineInput, SECRET);
    const payload = verifyRenderToken(token, SECRET);
    expect(payload.source).toBe("fixture");
    expect(payload.document).toMatchObject({
      kind: "inline",
      templateId: "resume-classic",
    });
  });

  it("round-trips a stored payload", () => {
    const token = mintRenderToken(storedInput, SECRET);
    const payload = verifyRenderToken(token, SECRET);
    expect(payload.document).toEqual({ kind: "stored", id: "doc_abc" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintRenderToken(inlineInput, SECRET);
    expect(() => verifyRenderToken(token, "another-secret-value")).toThrow(
      InvalidTokenError,
    );
  });

  it("rejects a tampered body", () => {
    const token = mintRenderToken(inlineInput, SECRET);
    const [body, sig] = token.split(".");
    const tampered = `${body}x.${sig}`;
    expect(() => verifyRenderToken(tampered, SECRET)).toThrow(InvalidTokenError);
  });

  it("rejects an expired token", () => {
    const token = signRenderToken(
      { ...inlineInput, exp: Date.now() - 1000 },
      SECRET,
    );
    expect(() => verifyRenderToken(token, SECRET)).toThrow(/expired/);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyRenderToken("not-a-token", SECRET)).toThrow(
      InvalidTokenError,
    );
  });

  it("rejects a payload whose document ref is neither inline nor stored", () => {
    const bad = Buffer.from(
      JSON.stringify({
        source: "fixture",
        ref: "ada",
        document: { kind: "bogus" },
        exp: Date.now() + 1000,
      }),
    ).toString("base64url");
    // Sign the raw body with a valid HMAC so it fails on shape, not signature.
    const sig = createHmac("sha256", SECRET).update(bad).digest("base64url");
    expect(() => verifyRenderToken(`${bad}.${sig}`, SECRET)).toThrow(
      /payload shape/,
    );
  });
});

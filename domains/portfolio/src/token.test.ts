import { describe, expect, it } from "vitest";

import {
  InvalidPreviewTokenError,
  mintPreviewToken,
  signPreviewToken,
  verifyPreviewToken,
  type PreviewTokenInput,
} from "./token";

const SECRET = "test-secret-at-least-16-chars";
const OTHER = "another-secret-at-least-16-chars";

const input: PreviewTokenInput = { source: "draft", ref: "user_123" };

describe("preview token", () => {
  it("round-trips a draft payload", () => {
    const token = mintPreviewToken(input, SECRET);
    const payload = verifyPreviewToken(token, SECRET);
    expect(payload.source).toBe("draft");
    expect(payload.ref).toBe("user_123");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintPreviewToken(input, SECRET);
    expect(() => verifyPreviewToken(token, OTHER)).toThrow(
      InvalidPreviewTokenError,
    );
  });

  it("rejects an expired token", () => {
    const token = signPreviewToken(
      { ...input, exp: Date.now() - 1000 },
      SECRET,
    );
    expect(() => verifyPreviewToken(token, SECRET)).toThrow(/expired/);
  });

  it("rejects a tampered payload", () => {
    const token = mintPreviewToken(input, SECRET);
    const [body, sig] = token.split(".");
    const forged = `${body}x.${sig}`;
    expect(() => verifyPreviewToken(forged, SECRET)).toThrow(
      InvalidPreviewTokenError,
    );
  });

  it("rejects a malformed token", () => {
    expect(() => verifyPreviewToken("not-a-token", SECRET)).toThrow(
      /malformed/,
    );
  });
});

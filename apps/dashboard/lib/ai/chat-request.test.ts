import { describe, expect, it } from "vitest";

import { parseChatRequest } from "./chat-request";
import { MAX_CHARS_PER_MESSAGE, MAX_MESSAGES, MAX_TOTAL_CHARS } from "./limits";

/**
 * The AI request boundary is a cost control, so these tests are about money and
 * safety as much as correctness: every case below is a request that would
 * otherwise reach a paid endpoint.
 */

function message(text: string, role: "user" | "assistant" = "user") {
  return { role, parts: [{ type: "text", text }] };
}

describe("parseChatRequest", () => {
  it("accepts a well-formed conversation", () => {
    const result = parseChatRequest({
      messages: [message("Make my summary more concise.")],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(1);
    }
  });

  it.each([
    ["null", null],
    ["a non-object", "hello"],
    ["a missing messages array", {}],
    ["an empty conversation", { messages: [] }],
    ["an unknown role", { messages: [{ role: "root", parts: [] }] }],
    ["a message with no parts", { messages: [{ role: "user", parts: [] }] }],
  ])("rejects %s as invalid", (_label, body) => {
    const result = parseChatRequest(body);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.kind).toBe("invalid");
    }
  });

  it("rejects more turns than the ceiling allows", () => {
    const result = parseChatRequest({
      messages: Array.from({ length: MAX_MESSAGES + 1 }, () => message("hi")),
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a single oversized message rather than truncating it", () => {
    // Truncation would silently answer a different question than the one asked.
    const result = parseChatRequest({
      messages: [message("x".repeat(MAX_CHARS_PER_MESSAGE + 1))],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.kind).toBe("too-large");
    }
  });

  it("drops the oldest turns to fit the total budget", () => {
    const big = "x".repeat(MAX_CHARS_PER_MESSAGE);
    const needed = Math.ceil(MAX_TOTAL_CHARS / MAX_CHARS_PER_MESSAGE) + 2;
    const messages = Array.from({ length: needed }, (_unused, index) =>
      message(index === needed - 1 ? "the newest turn" : big),
    );

    const result = parseChatRequest({ messages });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages.length).toBeLessThan(needed);
      // The invariant that matters: trimming is oldest-first, so the message
      // the user just typed is always the one that survives.
      const last = result.messages.at(-1);
      expect(last?.parts[0]).toMatchObject({ text: "the newest turn" });
    }
  });

  it("keeps non-text parts intact instead of stripping them", () => {
    // Phase 3+ sends tool and data parts through this same boundary; a
    // validator that quietly dropped them would fail far from its cause.
    const result = parseChatRequest({
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "here" },
            { type: "data-profile-proposal", data: { changes: [] } },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages[0]?.parts).toHaveLength(2);
      expect(result.messages[0]?.parts[1]).toMatchObject({
        type: "data-profile-proposal",
      });
    }
  });

  it("does not count non-text parts toward the character budget", () => {
    const result = parseChatRequest({
      messages: [
        {
          role: "user",
          parts: [{ type: "file", url: "x".repeat(MAX_CHARS_PER_MESSAGE * 2) }],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

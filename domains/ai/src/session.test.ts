import { describe, expect, it } from "vitest";

import {
  deriveSessionTitle,
  isWorthSaving,
  messageText,
  sanitizeMessages,
  storedChatMessagesSchema,
  MAX_SESSION_CHARS,
  MAX_STORED_MESSAGES,
  MAX_TITLE_CHARS,
  UNTITLED_SESSION,
  type StoredChatMessage,
} from "./session";

function userMessage(text: string, id = "u1"): StoredChatMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantMessage(text: string, id = "a1"): StoredChatMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

describe("storedChatMessagesSchema", () => {
  it("keeps unknown part shapes intact", () => {
    // The whole reason the part schema is loose: the app owns the tool set, and
    // a domain package that validated it strictly would make adding a tool a
    // breaking change here.
    const parsed = storedChatMessagesSchema.parse([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-proposeProfileChanges",
            state: "output-available",
            toolCallId: "call_1",
            output: { accepted: [{ field: "summary" }], rejected: [] },
          },
        ],
      },
    ]);

    expect(parsed[0]?.parts[0]).toMatchObject({
      type: "tool-proposeProfileChanges",
      output: { accepted: [{ field: "summary" }] },
    });
  });

  it("rejects a part with no type", () => {
    expect(
      storedChatMessagesSchema.safeParse([
        { id: "a1", role: "assistant", parts: [{ text: "hi" }] },
      ]).success,
    ).toBe(false);
  });

  it("rejects a role the SDK does not use", () => {
    expect(
      storedChatMessagesSchema.safeParse([
        { id: "a1", role: "tool", parts: [] },
      ]).success,
    ).toBe(false);
  });

  it("accepts more messages than it will keep", () => {
    // The load-bearing gap: the client's array grows past the storage ceiling
    // long before anything trims it, so a schema capped at that ceiling would
    // reject the save rather than trim it — and the history would silently stop
    // updating on exactly the conversations worth keeping.
    const long = Array.from({ length: MAX_STORED_MESSAGES + 50 }, (_, index) =>
      userMessage("hi", `u${index}`),
    );

    expect(storedChatMessagesSchema.safeParse(long).success).toBe(true);
    expect(sanitizeMessages(long)).toHaveLength(MAX_STORED_MESSAGES);
  });
});

describe("messageText", () => {
  it("joins text parts and collapses whitespace", () => {
    expect(
      messageText({
        id: "u1",
        role: "user",
        parts: [
          { type: "text", text: "Fix  1,\n2" },
          { type: "text", text: "and 5" },
        ],
      }),
    ).toBe("Fix 1, 2 and 5");
  });

  it("ignores non-text parts", () => {
    expect(
      messageText({
        id: "a1",
        role: "assistant",
        parts: [
          { type: "tool-proposeProfileChanges", state: "input-streaming" },
          { type: "text", text: "Here you go" },
        ],
      }),
    ).toBe("Here you go");
  });
});

describe("sanitizeMessages", () => {
  it("drops reasoning parts", () => {
    const [message] = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "the user probably means…" },
          { type: "text", text: "Here you go" },
        ],
      },
    ]);

    expect(message?.parts).toEqual([{ type: "text", text: "Here you go" }]);
  });

  it("drops step-start markers", () => {
    const [message] = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "step-start" }, { type: "text", text: "Done" }],
      },
    ]);

    expect(message?.parts).toHaveLength(1);
  });

  it("keeps an assistant turn that had only reasoning, as an empty one", () => {
    // It rendered as nothing at the time and should render as nothing on
    // reload — dropping the message would silently rewrite the conversation's
    // history into one where the model never answered.
    const result = sanitizeMessages([
      userMessage("hi"),
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "reasoning", text: "…" }],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[1]?.parts).toEqual([]);
  });

  it("trims to the message ceiling, keeping the newest", () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, index) =>
      userMessage(`message ${index}`, `u${index}`),
    );

    const result = sanitizeMessages(many);

    expect(result).toHaveLength(MAX_STORED_MESSAGES);
    expect(result.at(-1)?.id).toBe(`u${MAX_STORED_MESSAGES + 9}`);
  });

  it("trims oldest-first when the transcript is over the character budget", () => {
    const fat = "x".repeat(MAX_SESSION_CHARS / 4);
    const messages = [
      userMessage(fat, "u1"),
      assistantMessage(fat, "a1"),
      userMessage(fat, "u2"),
      assistantMessage(fat, "a2"),
      userMessage(fat, "u3"),
      assistantMessage(fat, "a3"),
    ];

    const result = sanitizeMessages(messages);

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(
      MAX_SESSION_CHARS,
    );
    // The newest turn always survives — the one direction that must never flip.
    expect(result.at(-1)?.id).toBe("a3");
    expect(result[0]?.id).not.toBe("u1");
  });

  it("never trims to nothing, even for a single oversized message", () => {
    const result = sanitizeMessages([
      userMessage("x".repeat(MAX_SESSION_CHARS * 2)),
    ]);

    expect(result).toHaveLength(1);
  });

  it("strips reasoning before measuring the budget", () => {
    // The ordering this asserts is the point: a heavily-reasoned turn must not
    // be able to evict real messages from a transcript that fits without it.
    const messages: StoredChatMessage[] = [
      userMessage("keep me", "u1"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "y".repeat(MAX_SESSION_CHARS) },
          { type: "text", text: "short answer" },
        ],
      },
    ];

    const result = sanitizeMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("u1");
  });
});

describe("deriveSessionTitle", () => {
  it("uses the first user message", () => {
    expect(
      deriveSessionTitle([
        assistantMessage("hello"),
        userMessage("Which parts of my profile look weakest?"),
        userMessage("fix 1 and 2", "u2"),
      ]),
    ).toBe("Which parts of my profile look weakest?");
  });

  it("falls back when there is nothing to name it after", () => {
    expect(deriveSessionTitle([])).toBe(UNTITLED_SESSION);
    expect(deriveSessionTitle([userMessage("   ")])).toBe(UNTITLED_SESSION);
  });

  it("cuts long titles on a word boundary", () => {
    const source =
      "Please review every single bullet point in my experience section and tell me which ones are weak";
    const title = deriveSessionTitle([userMessage(source)]);

    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1);
    expect(title.endsWith("…")).toBe(true);

    // A boundary cut, not a severed word: what is kept must be a whole prefix of
    // the original, and the next character in the original must be a space.
    const kept = title.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(" ");
  });

  it("cuts mid-word rather than throwing away most of the title", () => {
    // One very long word: honouring the last space would leave "A…", which is
    // a worse row than a truncated one.
    const title = deriveSessionTitle([
      userMessage(`A ${"b".repeat(MAX_TITLE_CHARS * 2)}`),
    ]);

    expect(title.length).toBeGreaterThan(MAX_TITLE_CHARS / 2);
  });
});

describe("isWorthSaving", () => {
  it("is false for a chat the user never spoke in", () => {
    expect(isWorthSaving([])).toBe(false);
    expect(isWorthSaving([assistantMessage("hi")])).toBe(false);
  });

  it("is true once there is a user turn", () => {
    expect(isWorthSaving([userMessage("hi")])).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

function collectingStream() {
  const lines: string[] = [];
  return {
    lines,
    write(chunk: string) {
      lines.push(chunk);
    },
  };
}

function lastLine(stream: { lines: string[] }): Record<string, unknown> {
  const line = stream.lines.at(-1);
  if (!line) throw new Error("no log output");
  return JSON.parse(line) as Record<string, unknown>;
}

describe("createLogger", () => {
  it("tags every line with its scope", () => {
    const stream = collectingStream();
    const log = createLogger("auth", { destination: stream });
    log.info("hello");
    expect(lastLine(stream)).toMatchObject({ scope: "auth", msg: "hello" });
  });

  it("redacts emails, tokens, and profile content", () => {
    const stream = collectingStream();
    const log = createLogger("test", { destination: stream });
    log.info(
      {
        email: "user@example.com",
        user: { email: "user@example.com", token: "tok_123" },
        accessToken: "at_123",
        profile: { name: "secret content" },
        headers: { authorization: "Bearer abc", cookie: "session=1" },
      },
      "event",
    );
    const entry = lastLine(stream);
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain("user@example.com");
    expect(raw).not.toContain("tok_123");
    expect(raw).not.toContain("at_123");
    expect(raw).not.toContain("secret content");
    expect(raw).not.toContain("Bearer abc");
    expect(entry["email"]).toBe("[redacted]");
  });

  it("respects the configured level", () => {
    const stream = collectingStream();
    const log = createLogger("test", { destination: stream, level: "warn" });
    log.info("dropped");
    log.warn("kept");
    expect(stream.lines).toHaveLength(1);
    expect(lastLine(stream)).toMatchObject({ msg: "kept" });
  });
});

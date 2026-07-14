import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ActionError, executeAction } from "./action-result";

const input = z.object({ name: z.string().min(1) });

describe("executeAction error normalization", () => {
  it("returns ok with the handler result for valid input", async () => {
    const result = await executeAction({
      input,
      rawInput: { name: "Ada" },
      handler: async ({ name }) => ({ greeting: `hi ${name}` }),
    });
    expect(result).toEqual({ ok: true, data: { greeting: "hi Ada" } });
  });

  it("maps schema failures to fieldErrors without running the handler", async () => {
    const handler = vi.fn();
    const result = await executeAction({
      input,
      rawInput: { name: "" },
      handler,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid input.");
      expect(result.fieldErrors).toHaveProperty("name");
    }
  });

  it("maps ActionError to its message and does not report it", async () => {
    const onUnexpectedError = vi.fn();
    const result = await executeAction({
      input,
      rawInput: { name: "Ada" },
      handler: async () => {
        throw new ActionError("You don't own this resource.");
      },
      onUnexpectedError,
    });
    expect(result).toEqual({
      ok: false,
      error: "You don't own this resource.",
    });
    expect(onUnexpectedError).not.toHaveBeenCalled();
  });

  it("hides unexpected errors behind a generic message and reports them", async () => {
    const boom = new Error("pg: connection refused");
    const onUnexpectedError = vi.fn();
    const result = await executeAction({
      input,
      rawInput: { name: "Ada" },
      handler: async () => {
        throw boom;
      },
      onUnexpectedError,
    });
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(onUnexpectedError).toHaveBeenCalledWith(boom);
  });

  it("never leaks internal error text to the client", async () => {
    const result = await executeAction({
      input,
      rawInput: { name: "Ada" },
      handler: async () => {
        throw new Error("SELECT * FROM users failed");
      },
    });
    expect(JSON.stringify(result)).not.toContain("SELECT");
  });
});

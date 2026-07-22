import { describe, expect, it } from "vitest";

import { handleSchema, isReservedHandle } from "./handle";

describe("handleSchema", () => {
  it("accepts valid handles", () => {
    for (const handle of ["ada", "jun-park", "dev2026", "a1b2c3"]) {
      expect(handleSchema.safeParse(handle).success).toBe(true);
    }
  });

  it("lowercases and trims before validating", () => {
    const parsed = handleSchema.safeParse("  Ada-Okonkwo  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("ada-okonkwo");
  });

  it("rejects too-short, too-long, and edge-hyphen handles", () => {
    for (const handle of ["ab", "-ada", "ada-", "a--b", "a".repeat(33)]) {
      expect(handleSchema.safeParse(handle).success).toBe(false);
    }
  });

  it("rejects invalid characters", () => {
    for (const handle of [
      "ada.okonkwo",
      "ada_okonkwo",
      "ada okonkwo",
      "adá",
    ]) {
      expect(handleSchema.safeParse(handle).success).toBe(false);
    }
  });

  it("rejects reserved handles (case-insensitively)", () => {
    for (const handle of ["admin", "API", "Dashboard", "www", "blog"]) {
      expect(handleSchema.safeParse(handle).success).toBe(false);
    }
  });

  it("reserves both public route namespaces, `p` and `r`", () => {
    expect(handleSchema.safeParse("p").success).toBe(false);
    expect(handleSchema.safeParse("r").success).toBe(false);
  });
});

describe("isReservedHandle", () => {
  it("flags reserved words regardless of case/whitespace", () => {
    expect(isReservedHandle("admin")).toBe(true);
    expect(isReservedHandle("  ADMIN ")).toBe(true);
    expect(isReservedHandle("r")).toBe(true);
    expect(isReservedHandle("ada")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { isReservedSlug, siteSlugSchema } from "./schema";

describe("siteSlugSchema", () => {
  it("accepts valid slugs", () => {
    for (const slug of ["ada", "jun-park", "dev2026", "a1b2c3"]) {
      expect(siteSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it("lowercases and trims before validating", () => {
    const parsed = siteSlugSchema.safeParse("  Ada-Okonkwo  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("ada-okonkwo");
  });

  it("rejects too-short, too-long, and edge-hyphen slugs", () => {
    for (const slug of ["ab", "-ada", "ada-", "a--b", "a".repeat(33)]) {
      expect(siteSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it("rejects invalid characters", () => {
    for (const slug of ["ada.okonkwo", "ada_okonkwo", "ada okonkwo", "adá"]) {
      expect(siteSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it("rejects reserved slugs (case-insensitively)", () => {
    for (const slug of ["admin", "API", "Dashboard", "www", "blog"]) {
      expect(siteSlugSchema.safeParse(slug).success).toBe(false);
    }
  });
});

describe("isReservedSlug", () => {
  it("flags reserved words regardless of case/whitespace", () => {
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("  ADMIN ")).toBe(true);
    expect(isReservedSlug("ada")).toBe(false);
  });
});

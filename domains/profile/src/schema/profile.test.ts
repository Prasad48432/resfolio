import { describe, expect, it } from "vitest";

import { createItemId } from "../ids";
import { createEmptyProfile, createSeedProfile } from "../seed";
import { PROFILE_SCHEMA_VERSION, profileSchema } from "./profile";
import {
  calendarDateSchema,
  httpUrlSchema,
  richTextSchema,
  safeLinkUrlSchema,
} from "./primitives";
import { experienceItemSchema, profileLinkSchema } from "./sections";

describe("profileSchema", () => {
  it("accepts an empty profile at the current version", () => {
    const parsed = profileSchema.parse(createEmptyProfile());
    expect(parsed.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(parsed.sections.experience).toEqual([]);
  });

  it("accepts the seeded starter profile", () => {
    const seeded = createSeedProfile({ name: "Sam", email: "sam@example.com" });
    expect(() => profileSchema.parse(seeded)).not.toThrow();
    expect(seeded.basics.name).toBe("Sam");
    expect(seeded.sections.experience.length).toBeGreaterThan(0);
  });

  it("rejects the wrong schemaVersion", () => {
    const wrong = { ...createEmptyProfile(), schemaVersion: 2 };
    expect(profileSchema.safeParse(wrong).success).toBe(false);
  });

  it("applies section-item defaults (source, empty arrays)", () => {
    const item = experienceItemSchema.parse({
      id: createItemId(),
      company: "Acme",
      role: "Engineer",
    });
    expect(item.source).toBe("manual");
    expect(item.highlights).toEqual([]);
    expect(item.summary).toBe("");
  });
});

describe("url validation (doc 10: hostile input)", () => {
  it("accepts http/https", () => {
    expect(httpUrlSchema.safeParse("https://example.com").success).toBe(true);
  });

  it("rejects javascript: and data: schemes", () => {
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      httpUrlSchema.safeParse("data:text/html;base64,PHN2Zz4=").success,
    ).toBe(false);
  });

  it("rejects mailto: for plain urls but allows it for links", () => {
    expect(httpUrlSchema.safeParse("mailto:a@b.com").success).toBe(false);
    expect(safeLinkUrlSchema.safeParse("mailto:a@b.com").success).toBe(true);
  });

  it("rejects a link whose url is javascript:", () => {
    const result = profileLinkSchema.safeParse({
      id: createItemId(),
      label: "Evil",
      url: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });
});

describe("rich text (doc 01: constrained markdown subset)", () => {
  it("accepts bold/italic/link markdown", () => {
    const value = "Shipped **fast** and _clean_ — see [docs](https://x.com).";
    expect(richTextSchema.safeParse(value).success).toBe(true);
  });

  it("rejects raw HTML", () => {
    expect(richTextSchema.safeParse("<script>alert(1)</script>").success).toBe(
      false,
    );
    expect(richTextSchema.safeParse("<b>bold</b>").success).toBe(false);
  });

  it("rejects markdown links with unsafe schemes", () => {
    expect(
      richTextSchema.safeParse("[click](javascript:alert(1))").success,
    ).toBe(false);
  });
});

describe("calendar dates (doc 01: optional precision)", () => {
  it.each(["2024", "2024-06", "2024-06-15"])("accepts %s", (value) => {
    expect(calendarDateSchema.safeParse(value).success).toBe(true);
  });

  it.each(["2024-13", "2024-06-32", "06-2024", "not-a-date"])(
    "rejects %s",
    (value) => {
      expect(calendarDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

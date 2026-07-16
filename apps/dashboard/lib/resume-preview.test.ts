import { describe, expect, it } from "vitest";

import {
  PX_PER_MM,
  pageCount,
  pageDimensionsPx,
  previewScale,
} from "./resume-preview";

describe("pageDimensionsPx", () => {
  it("resolves A4 and Letter to their 96dpi pixel boxes", () => {
    const a4 = pageDimensionsPx("A4");
    expect(a4.widthPx).toBeCloseTo(210 * PX_PER_MM);
    expect(a4.heightPx).toBeCloseTo(297 * PX_PER_MM);

    const letter = pageDimensionsPx("LETTER");
    expect(letter.widthPx).toBeCloseTo(216 * PX_PER_MM);
    expect(letter.heightPx).toBeCloseTo(279 * PX_PER_MM);
    // Letter is wider but shorter than A4.
    expect(letter.widthPx).toBeGreaterThan(a4.widthPx);
    expect(letter.heightPx).toBeLessThan(a4.heightPx);
  });
});

describe("previewScale", () => {
  it("shrinks to fit a narrow pane", () => {
    expect(previewScale(400, 800)).toBe(0.5);
  });

  it("never upscales past 1", () => {
    expect(previewScale(2000, 800)).toBe(1);
  });

  it("is defensive about non-positive inputs", () => {
    expect(previewScale(0, 800)).toBe(1);
    expect(previewScale(400, 0)).toBe(1);
  });
});

describe("pageCount", () => {
  it("returns 1 for content that fits one page", () => {
    expect(pageCount(500, 1000)).toBe(1);
    expect(pageCount(1000, 1000)).toBe(1);
  });

  it("rounds up to cover overflow", () => {
    expect(pageCount(1001, 1000)).toBe(2);
    expect(pageCount(2500, 1000)).toBe(3);
  });

  it("is defensive about non-positive inputs", () => {
    expect(pageCount(0, 1000)).toBe(1);
    expect(pageCount(500, 0)).toBe(1);
  });
});

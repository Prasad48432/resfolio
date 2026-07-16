import { describe, expect, it } from "vitest";

import { formatCalendarDate, formatDateRange } from "./format";

describe("formatCalendarDate", () => {
  it("passes year-only through", () => {
    expect(formatCalendarDate("2013")).toBe("2013");
  });

  it("formats year-month", () => {
    expect(formatCalendarDate("2021-03")).toBe("Mar 2021");
  });

  it("collapses day precision to month", () => {
    expect(formatCalendarDate("2021-03-14")).toBe("Mar 2021");
  });

  it("returns empty for undefined", () => {
    expect(formatCalendarDate(undefined)).toBe("");
  });
});

describe("formatDateRange", () => {
  it("reads a start with no end as ongoing", () => {
    expect(formatDateRange("2021-03", undefined)).toBe("Mar 2021 – Present");
  });

  it("honors a custom present label", () => {
    expect(formatDateRange("2021-03", undefined, { present: "Now" })).toBe(
      "Mar 2021 – Now",
    );
  });

  it("formats a closed range", () => {
    expect(formatDateRange("2017-06", "2021-02")).toBe("Jun 2017 – Feb 2021");
  });

  it("shows just the end when there is no start", () => {
    expect(formatDateRange(undefined, "2021-02")).toBe("Feb 2021");
  });

  it("returns empty when both are absent", () => {
    expect(formatDateRange(undefined, undefined)).toBe("");
  });

  it("is deterministic (no clock)", () => {
    expect(formatDateRange("2020-01", undefined)).toBe(
      formatDateRange("2020-01", undefined),
    );
  });
});

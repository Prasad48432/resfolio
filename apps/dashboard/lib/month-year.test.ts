import { describe, expect, it } from "vitest";

import { boundsFor, toMonthBound } from "./month-year";

describe("toMonthBound", () => {
  it("passes a YYYY-MM value through", () => {
    expect(toMonthBound("2021-03")).toBe("2021-03");
  });

  it("truncates a stored YYYY-MM-DD to its month", () => {
    expect(toMonthBound("2021-03-17")).toBe("2021-03");
  });

  // A bare year is "some time in that year", so January is the widest honest
  // floor — anything later would forbid ends the user is entitled to pick.
  it("widens a bare YYYY to January", () => {
    expect(toMonthBound("2021")).toBe("2021-01");
  });

  it("returns undefined for anything unparseable", () => {
    expect(toMonthBound("")).toBeUndefined();
    expect(toMonthBound("March 2021")).toBeUndefined();
    expect(toMonthBound(undefined)).toBeUndefined();
    expect(toMonthBound(42)).toBeUndefined();
  });
});

describe("boundsFor", () => {
  it("makes a start date the floor of its end date", () => {
    expect(boundsFor("after", "2021-03")).toEqual({ min: "2021-03" });
  });

  it("makes an end date the ceiling of its start date", () => {
    expect(boundsFor("before", "2024-06")).toEqual({ max: "2024-06" });
  });

  // An unset sibling must not constrain anything — an end with no start is a
  // perfectly ordinary in-progress entry.
  it("returns no bound when the sibling is empty", () => {
    expect(boundsFor("after", "")).toEqual({});
    expect(boundsFor("before", undefined)).toEqual({});
  });

  // The whole reason bounds are strings: YYYY-MM sorts in date order, so the
  // picker's comparisons need no Date and no timezone.
  it("produces bounds that compare correctly as strings", () => {
    const { min } = boundsFor("after", "2021-09");
    expect("2021-10" > min!).toBe(true);
    expect("2021-08" > min!).toBe(false);
    expect("2022-01" > min!).toBe(true);
  });
});

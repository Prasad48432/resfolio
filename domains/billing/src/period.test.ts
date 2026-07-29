import { describe, expect, it } from "vitest";

import {
  addUtcMonthsClamped,
  periodStartFor,
  resolveQuotaPeriod,
  startOfUtcMonth,
} from "./period";

const iso = (d: Date) => d.toISOString();

describe("startOfUtcMonth", () => {
  it("returns midnight UTC on the first", () => {
    expect(iso(startOfUtcMonth(new Date("2026-07-29T13:45:12.500Z")))).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });
});

describe("addUtcMonthsClamped", () => {
  it("keeps the day and the time of day", () => {
    const anchor = new Date("2026-03-20T09:30:00.000Z");
    expect(iso(addUtcMonthsClamped(anchor, 1))).toBe(
      "2026-04-20T09:30:00.000Z",
    );
  });

  it("clamps to the last day of a shorter month", () => {
    const anchor = new Date("2026-01-31T00:00:00.000Z");
    // 2026 is not a leap year.
    expect(iso(addUtcMonthsClamped(anchor, 1))).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("clamps to 29 February in a leap year", () => {
    const anchor = new Date("2028-01-31T00:00:00.000Z");
    expect(iso(addUtcMonthsClamped(anchor, 1))).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("does not make the clamp sticky", () => {
    // The whole reason this is computed from the original anchor rather than by
    // stepping: Jan 31 → Feb 28 → *Mar 31*, not Mar 28.
    const anchor = new Date("2026-01-31T00:00:00.000Z");
    expect(iso(addUtcMonthsClamped(anchor, 2))).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });

  it("rolls across a year boundary in both directions", () => {
    const anchor = new Date("2026-11-15T00:00:00.000Z");
    expect(iso(addUtcMonthsClamped(anchor, 3))).toBe(
      "2027-02-15T00:00:00.000Z",
    );
    expect(iso(addUtcMonthsClamped(anchor, -12))).toBe(
      "2025-11-15T00:00:00.000Z",
    );
  });
});

describe("resolveQuotaPeriod — free", () => {
  it("uses the calendar month", () => {
    const period = resolveQuotaPeriod({
      planId: "free",
      anchor: null,
      now: new Date("2026-07-29T13:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-08-01T00:00:00.000Z");
  });

  it("rolls into a new year", () => {
    const period = resolveQuotaPeriod({
      planId: "free",
      anchor: null,
      now: new Date("2026-12-31T23:59:59.000Z"),
    });
    expect(iso(period.end)).toBe("2027-01-01T00:00:00.000Z");
  });

  it("ignores an anchor if one is somehow present", () => {
    // A downgraded user keeps their old subscription row; the free plan must
    // still use the calendar, or their period would follow a plan they no
    // longer have.
    const period = resolveQuotaPeriod({
      planId: "free",
      anchor: new Date("2026-07-20T00:00:00.000Z"),
      now: new Date("2026-07-29T00:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("resolveQuotaPeriod — weekly", () => {
  const anchor = new Date("2026-07-20T10:00:00.000Z");

  it("starts at the anchor on day one", () => {
    const period = resolveQuotaPeriod({
      planId: "weekly",
      anchor,
      now: new Date("2026-07-20T10:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-20T10:00:00.000Z");
    expect(iso(period.end)).toBe("2026-07-27T10:00:00.000Z");
  });

  it("holds for the whole seven days", () => {
    const period = resolveQuotaPeriod({
      planId: "weekly",
      anchor,
      now: new Date("2026-07-26T23:59:59.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-20T10:00:00.000Z");
  });

  it("rolls to a new period at exactly seven days", () => {
    const period = resolveQuotaPeriod({
      planId: "weekly",
      anchor,
      now: new Date("2026-07-27T10:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-27T10:00:00.000Z");
  });

  it("does not accrue extra allowance from stacked passes", () => {
    // Two passes back to back extend period_end, but the quota period is still
    // seven days — buying passes must not be a way to buy a month of credits
    // at once (§4.1).
    const period = resolveQuotaPeriod({
      planId: "weekly",
      anchor,
      now: new Date("2026-08-01T10:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-27T10:00:00.000Z");
    expect(iso(period.end)).toBe("2026-08-03T10:00:00.000Z");
  });
});

describe("resolveQuotaPeriod — monthly", () => {
  const anchor = new Date("2026-03-20T09:30:00.000Z");

  it("starts at the anchor", () => {
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2026-03-20T09:30:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-03-20T09:30:00.000Z");
    expect(iso(period.end)).toBe("2026-04-20T09:30:00.000Z");
  });

  it("does not roll at the calendar month boundary", () => {
    // The point of anchoring: 1 April is not a reset for a subscription that
    // started on 20 March.
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-03-20T09:30:00.000Z");
  });

  it("rolls on the anchor's day of month", () => {
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2026-04-20T09:30:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-04-20T09:30:00.000Z");
  });

  it("holds until one millisecond before the anchor time", () => {
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2026-04-20T09:29:59.999Z"),
    });
    expect(iso(period.start)).toBe("2026-03-20T09:30:00.000Z");
  });

  it("clamps a 31st anchor through February and recovers in March", () => {
    // The edge case that would otherwise leave an allowance that never resets.
    const jan31 = new Date("2026-01-31T00:00:00.000Z");

    expect(
      iso(
        periodStartFor({
          planId: "monthly",
          anchor: jan31,
          now: new Date("2026-02-28T12:00:00.000Z"),
        }),
      ),
    ).toBe("2026-02-28T00:00:00.000Z");

    expect(
      iso(
        periodStartFor({
          planId: "monthly",
          anchor: jan31,
          now: new Date("2026-03-31T00:00:00.000Z"),
        }),
      ),
    ).toBe("2026-03-31T00:00:00.000Z");
  });

  it("works many months after the anchor, across a year boundary", () => {
    // Anchor 20 March 2026 + 10 months = 20 January 2027, which is the period
    // containing the 25th.
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2027-01-25T00:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2027-01-20T09:30:00.000Z");
    expect(iso(period.end)).toBe("2027-02-20T09:30:00.000Z");
  });

  it("selects the previous period when now is earlier in the month than the anchor", () => {
    // The branch that decrements `steps`: the calendar-month difference
    // overshoots whenever the day-of-month has not come round yet.
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2027-01-03T00:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-12-20T09:30:00.000Z");
    expect(iso(period.end)).toBe("2027-01-20T09:30:00.000Z");
  });
});

describe("resolveQuotaPeriod — yearly", () => {
  const anchor = new Date("2026-02-10T00:00:00.000Z");

  it("accrues MONTHLY, not yearly", () => {
    // The single most expensive thing in this file to get wrong: a yearly
    // subscriber must not get twelve months of allowance on day one.
    const period = resolveQuotaPeriod({
      planId: "yearly",
      anchor,
      now: new Date("2026-02-10T00:00:00.000Z"),
    });
    expect(iso(period.end)).toBe("2026-03-10T00:00:00.000Z");
  });

  it("resets every month through the year", () => {
    expect(
      iso(
        periodStartFor({
          planId: "yearly",
          anchor,
          now: new Date("2026-09-15T00:00:00.000Z"),
        }),
      ),
    ).toBe("2026-09-10T00:00:00.000Z");
  });

  it("keeps resetting monthly after the renewal date passes", () => {
    expect(
      iso(
        periodStartFor({
          planId: "yearly",
          anchor,
          now: new Date("2027-04-01T00:00:00.000Z"),
        }),
      ),
    ).toBe("2027-03-10T00:00:00.000Z");
  });
});

describe("resolveQuotaPeriod — defensive", () => {
  it("treats a now before the anchor as the first period", () => {
    const anchor = new Date("2026-07-20T00:00:00.000Z");
    const period = resolveQuotaPeriod({
      planId: "monthly",
      anchor,
      now: new Date("2026-07-19T00:00:00.000Z"),
    });
    expect(iso(period.start)).toBe("2026-07-20T00:00:00.000Z");
  });

  it("never returns a period that does not contain now", () => {
    // Property check across a year of daily instants and several anchor shapes,
    // because an off-by-one here is a silent double allowance.
    const anchors = [
      new Date("2026-01-31T23:59:59.000Z"),
      new Date("2026-02-28T00:00:00.000Z"),
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-06-30T12:00:00.000Z"),
    ];

    for (const anchor of anchors) {
      for (const planId of ["weekly", "monthly", "yearly"] as const) {
        for (let day = 0; day < 400; day += 1) {
          const now = new Date(anchor.getTime() + day * 24 * 60 * 60 * 1000);
          const { start, end } = resolveQuotaPeriod({ planId, anchor, now });

          expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
          expect(end.getTime()).toBeGreaterThan(now.getTime());
        }
      }
    }
  });
});

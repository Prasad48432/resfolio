import { describe, expect, it } from "vitest";

import {
  allowanceFor,
  isPaid,
  resolveEntitlement,
  type SubscriptionRecord,
} from "./entitlement";
import { GRACE_WINDOW_MS, PLAN_LIMITS } from "./limits";
import { SUBSCRIPTION_STATUSES } from "./plans";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function subscription(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    planId: "monthly",
    status: "active",
    interval: "month",
    periodStart: new Date("2026-07-10T00:00:00.000Z"),
    periodEnd: new Date("2026-08-10T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    statusChangedAt: new Date("2026-07-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolveEntitlement — no subscription", () => {
  it("grants free when there is no row", () => {
    const entitlement = resolveEntitlement(null, NOW);
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("none");
    expect(entitlement.limits).toEqual(PLAN_LIMITS.free);
    expect(entitlement.anchor).toBeNull();
  });

  it("grants free for a free-plan row whatever its status says", () => {
    // A downgraded user keeps their row. Reading `status: active` off it must
    // not hand back a paid plan they no longer have.
    const entitlement = resolveEntitlement(
      subscription({ planId: "free", status: "active" }),
      NOW,
    );
    expect(entitlement.planId).toBe("free");
  });
});

describe("resolveEntitlement — active", () => {
  it("grants the plan", () => {
    const entitlement = resolveEntitlement(subscription(), NOW);
    expect(entitlement.planId).toBe("monthly");
    expect(entitlement.reason).toBe("active");
    expect(entitlement.inGrace).toBe(false);
    expect(entitlement.limits).toEqual(PLAN_LIMITS.monthly);
  });

  it("passes periodStart through as the quota anchor", () => {
    const entitlement = resolveEntitlement(subscription(), NOW);
    expect(entitlement.anchor?.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("expires a week pass on read, with no event", () => {
    // The pass is the one product nothing ever arrives to close: a one-time
    // payment has no renewal, so expiry has to be a property of reading it.
    const expired = subscription({
      planId: "weekly",
      interval: "week",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-08T00:00:00.000Z"),
    });
    const entitlement = resolveEntitlement(expired, NOW);
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("lapsed");
    expect(entitlement.anchor).toBeNull();
  });

  it("holds a pass until the exact instant it ends", () => {
    const pass = subscription({
      planId: "weekly",
      interval: "week",
      periodEnd: new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(
      resolveEntitlement(pass, new Date("2026-07-29T11:59:59.999Z")).planId,
    ).toBe("weekly");
    // Ends at exactly period_end — inclusive of the boundary.
    expect(resolveEntitlement(pass, NOW).planId).toBe("free");
  });

  it("does not expire a row with no known end", () => {
    const entitlement = resolveEntitlement(
      subscription({ periodEnd: null }),
      NOW,
    );
    expect(entitlement.planId).toBe("monthly");
  });
});

describe("resolveEntitlement — on_hold and grace", () => {
  const heldAt = new Date("2026-07-29T00:00:00.000Z");

  it("retains the paid plan inside the grace window", () => {
    const entitlement = resolveEntitlement(
      subscription({ status: "on_hold", statusChangedAt: heldAt }),
      NOW,
    );
    expect(entitlement.planId).toBe("monthly");
    expect(entitlement.reason).toBe("grace");
    expect(entitlement.inGrace).toBe(true);
  });

  it("drops to free once grace has run out", () => {
    const after = new Date(heldAt.getTime() + GRACE_WINDOW_MS + 1);
    const entitlement = resolveEntitlement(
      subscription({ status: "on_hold", statusChangedAt: heldAt }),
      after,
    );
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("lapsed");
    expect(entitlement.inGrace).toBe(false);
  });

  it("ends grace at exactly the window boundary", () => {
    const boundary = new Date(heldAt.getTime() + GRACE_WINDOW_MS);
    expect(
      resolveEntitlement(
        subscription({ status: "on_hold", statusChangedAt: heldAt }),
        new Date(boundary.getTime() - 1),
      ).planId,
    ).toBe("monthly");
    expect(
      resolveEntitlement(
        subscription({ status: "on_hold", statusChangedAt: heldAt }),
        boundary,
      ).planId,
    ).toBe("free");
  });

  it("measures grace from statusChangedAt, not from the period", () => {
    // The reason statusChangedAt is a column of its own: a row touched for an
    // unrelated reason must not restart the window.
    const longAgo = subscription({
      status: "on_hold",
      statusChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      periodStart: new Date("2026-07-29T00:00:00.000Z"),
      periodEnd: new Date("2026-08-29T00:00:00.000Z"),
    });
    expect(resolveEntitlement(longAgo, NOW).planId).toBe("free");
  });
});

describe("resolveEntitlement — cancelled", () => {
  it("keeps access to the end of a paid term", () => {
    const entitlement = resolveEntitlement(
      subscription({ status: "cancelled", cancelAtPeriodEnd: true }),
      NOW,
    );
    expect(entitlement.planId).toBe("monthly");
    expect(entitlement.reason).toBe("cancelled_until_period_end");
    expect(entitlement.activeUntil?.toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("drops to free once that term ends", () => {
    const entitlement = resolveEntitlement(
      subscription({
        status: "cancelled",
        cancelAtPeriodEnd: true,
        periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      }),
      NOW,
    );
    expect(entitlement.planId).toBe("free");
  });

  it("drops to free immediately when cancellation is not end-of-period", () => {
    // A refund or dispute cancels outright rather than at the boundary.
    const entitlement = resolveEntitlement(
      subscription({ status: "cancelled", cancelAtPeriodEnd: false }),
      NOW,
    );
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("lapsed");
  });
});

describe("resolveEntitlement — terminal states", () => {
  it("treats expired as lapsed", () => {
    const entitlement = resolveEntitlement(
      subscription({ status: "expired" }),
      NOW,
    );
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("lapsed");
  });

  it("treats failed as never having granted anything", () => {
    // A mandate that never established has nothing to lapse *from*, and the
    // distinction matters for what the billing page says.
    const entitlement = resolveEntitlement(
      subscription({ status: "failed" }),
      NOW,
    );
    expect(entitlement.planId).toBe("free");
    expect(entitlement.reason).toBe("none");
  });
});

describe("resolveEntitlement — exhaustiveness", () => {
  it("handles every declared status without throwing", () => {
    // The switch has a `never` guard, so this cannot regress silently at
    // compile time — but a status added to the array and to the switch with a
    // wrong branch would still get here.
    for (const status of SUBSCRIPTION_STATUSES) {
      const entitlement = resolveEntitlement(subscription({ status }), NOW);
      expect(entitlement.limits).toBe(PLAN_LIMITS[entitlement.planId]);
    }
  });

  it("never returns an anchor while on the free plan", () => {
    // A lapsed user's counters must fall back to the calendar month, or they
    // keep a period anchored to a plan they no longer hold.
    for (const status of SUBSCRIPTION_STATUSES) {
      const entitlement = resolveEntitlement(
        subscription({ status, cancelAtPeriodEnd: false }),
        new Date("2027-01-01T00:00:00.000Z"),
      );
      if (entitlement.planId === "free") {
        expect(entitlement.anchor).toBeNull();
      }
    }
  });
});

describe("helpers", () => {
  it("reads an allowance for a feature", () => {
    const entitlement = resolveEntitlement(subscription(), NOW);
    expect(allowanceFor(entitlement, "jobMatch")).toBe(
      PLAN_LIMITS.monthly.jobMatch,
    );
  });

  it("reports whether a paid plan is in force", () => {
    expect(isPaid(resolveEntitlement(subscription(), NOW))).toBe(true);
    expect(isPaid(resolveEntitlement(null, NOW))).toBe(false);
  });
});

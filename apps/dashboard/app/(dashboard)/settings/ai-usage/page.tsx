import { requireSession } from "@resfolio/auth";
import { PLAN_LABELS, daysUntilReset } from "@resfolio/billing";
import { getUsageSummary, isBillingEnforced } from "@resfolio/billing/server";
import { Card } from "@resfolio/ui";
import type { Metadata } from "next";

import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { UsageMeter } from "@/components/settings/usage-meter";
import { isAiAvailable } from "@/lib/ai/provider";
import { TEST_IDS } from "@/lib/testids";

export const metadata: Metadata = {
  title: "AI usage — Resfolio",
};

/**
 * Settings → AI usage (docs/architecture/14-ai-usage-and-billing.md §13).
 *
 * **One server call.** `getUsageSummary` is two round trips — a subscription read
 * and one counter query for every feature — and it must not become one per
 * feature: Postgres is in Singapore and compute is in Mumbai (doc 15 §2.6), so a
 * query per row would cost 250–300ms before anything rendered.
 *
 * Everything after that is the pure `summariseUsage`, which is also what the
 * inline counters and the 402 copy read. That is the property this screen depends
 * on: a user who is told "you've used all 10" by a refusal and "8 / 10" by this
 * page has been told two things, and will believe neither.
 *
 * **It shows every feature, including the ones at zero.** A screen listing only
 * what has been used hides features from exactly the people most likely to try
 * them — the list is also how someone learns there is a tailoring feature at all.
 *
 * There is no Upgrade button yet, deliberately: checkout is §11 step 6 and does
 * not exist. A button that opens nothing is worse than a sentence saying where
 * things stand, so this page states the plan and stops.
 */
export default async function AiUsagePage() {
  // Defense in depth: pages guard themselves too, not just the layout.
  const { user } = await requireSession();

  const now = new Date();
  const summary = await getUsageSummary(user.id, now);
  const days = daysUntilReset(summary.resetsAt, now);

  return (
    <Page>
      <PageHeader
        title="AI usage"
        description="What Resfolio AI has used this period, and what your plan allows."
      />

      <SettingsNav />

      <Card
        className="flex flex-col gap-5 p-5"
        data-testid={TEST_IDS.aiUsageCard}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="flex flex-col gap-0.5">
            <span className="label-section">Plan</span>
            <p className="text-sm text-foreground">
              {PLAN_LABELS[summary.planId]}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className="label-section">Resets</span>
            {/*
              **The date and the countdown, both.** Doc 14 names this field
              precisely because on a yearly plan the allowance resets monthly while
              the renewal is annual — "resets" is not "renews", and a page showing
              only "in 9 days" invites the reader to assume it means their
              subscription.
            */}
            <p className="text-sm text-foreground">
              {summary.resetsAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}
              <span className="text-muted">
                {" · "}
                {days === 1 ? "tomorrow" : `in ${days} days`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {summary.features.map((usage) => (
            <UsageMeter key={usage.feature} usage={usage} />
          ))}
        </div>
      </Card>

      {/*
        Two honest notes, and both are temporary by design.

        The first is the one a user could otherwise be misled by: while
        `BILLING_ENFORCED=false` these numbers are a record, not a ceiling
        (§11 steps 3–4 — meter first, measure, then enforce). Showing bars that
        look like limits while nothing is refused would teach people a rule the
        product is not applying, and then surprise them twice: once when they
        believe it, and again when it becomes true.
      */}
      {isBillingEnforced() ? null : (
        <p className="text-xs leading-relaxed text-muted">
          These are being recorded while we tune the limits. Nothing is blocked
          yet — if you go over, Resfolio AI keeps working.
        </p>
      )}

      {isAiAvailable() ? null : (
        <p className="text-xs leading-relaxed text-muted">
          Resfolio AI isn&rsquo;t available in this environment, so nothing here
          will change.
        </p>
      )}
    </Page>
  );
}

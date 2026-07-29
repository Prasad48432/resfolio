"use client";

import { Card } from "@resfolio/ui";
import { Check, Circle, Minus, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type {
  KeywordCoverage,
  MatchLevel,
  MatchSummary,
  VerifiedRequirement,
} from "@/lib/ai/job-analysis";
import { requirementRowTestId, TEST_IDS } from "@/lib/testids";

/**
 * The analysis, rendered (docs/architecture/13-ai-layer.md, Phase 4).
 *
 * **The score shows its working, and that is the point of it.** A bare "82%"
 * from a product that read your resume is a number you either believe or don't;
 * "11 strong · 3 partial · 5 gaps out of 19" is a number you can check, and the
 * requirement list underneath is where you check it. The percentage is computed
 * by `summarizeMatch`, never by the model — a model-produced statistic is not
 * reproducible across two runs of the same posting, and this one is.
 *
 * **Gaps are not styled as errors.** Red would make the most useful line the
 * feature produces — "this posting wants Kubernetes and your profile doesn't
 * mention it" — read as something going wrong. Strong is the only level that
 * gets colour; partial gets the brand rule; a gap is quiet.
 */

const LEVEL_STYLES: Record<
  MatchLevel,
  { label: string; icon: typeof Check; className: string }
> = {
  strong: { label: "Strong", icon: Check, className: "text-live" },
  partial: { label: "Partial", icon: Circle, className: "text-brand" },
  gap: { label: "Gap", icon: Minus, className: "text-muted" },
};

export function JobMatchResult({
  role,
  requirements,
  keywords,
  summary,
  showScore,
}: {
  role: string;
  requirements: VerifiedRequirement[];
  keywords: KeywordCoverage[];
  summary: MatchSummary;
  showScore: boolean;
}) {
  const downgraded = requirements.filter((entry) => entry.downgraded).length;
  const missing = keywords.filter((entry) => !entry.present);

  return (
    <div className="flex flex-col gap-6" data-testid={TEST_IDS.jobResult}>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="label-section">Match</p>
            {role ? (
              <p className="truncate text-[13px] text-muted">{role}</p>
            ) : null}
          </div>
          {showScore ? (
            <p
              className="text-3xl leading-none font-medium tabular-nums"
              data-testid={TEST_IDS.jobScore}
            >
              {summary.score}%
            </p>
          ) : (
            <p className="text-[13px] text-muted">{summary.total} so far…</p>
          )}
        </div>
        {/* The working. Without it the percentage is just an assertion, which
            is the thing this whole design refuses to ship. */}
        <p className="text-xs text-muted tabular-nums">
          {summary.strong} strong · {summary.partial} partial · {summary.gap}{" "}
          {summary.gap === 1 ? "gap" : "gaps"} — out of {summary.total}
          {showScore ? ". Strong counts 1, partial counts a half." : ""}
        </p>
        {downgraded > 0 ? (
          <p
            className="flex items-start gap-1.5 text-xs text-muted"
            data-testid={TEST_IDS.jobDowngraded}
          >
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {downgraded} {downgraded === 1 ? "match was" : "matches were"}{" "}
            recorded as a gap instead — nothing in your profile backed{" "}
            {downgraded === 1 ? "it" : "them"} up.
          </p>
        ) : null}
      </Card>

      <section className="flex flex-col gap-2">
        <p className="label-section">Requirements</p>
        {requirements.map((requirement, index) => (
          <RequirementRow key={index} index={index} requirement={requirement} />
        ))}
      </section>

      {keywords.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="label-section">
            Keywords{missing.length > 0 ? ` · ${missing.length} missing` : ""}
          </p>
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={TEST_IDS.jobKeywords}
          >
            {keywords.map((entry) => (
              <span
                key={entry.keyword}
                className={
                  entry.present
                    ? "max-w-full rounded-full border border-border px-2 py-0.5 text-xs wrap-anywhere text-muted"
                    : "max-w-full rounded-full border border-brand/40 px-2 py-0.5 text-xs wrap-anywhere"
                }
                // Presence is checked by us against the profile, not asserted by
                // the model — so the title can state it as fact. An either/or
                // term names the option that satisfied it, because "Angular/React
                // ✓" against a profile with no Angular is the kind of tick a
                // reader is right to distrust until it shows its working.
                title={
                  entry.present
                    ? entry.matched
                      ? `Covered by ${entry.matched} — this posting accepts any of ${entry.alternatives.join(", ")}`
                      : "Appears in your profile"
                    : entry.alternatives.length > 0
                      ? `None of ${entry.alternatives.join(", ")} appears in your profile`
                      : "Not found anywhere in your profile"
                }
              >
                {entry.keyword}
                {entry.matched ? (
                  <span className="text-live"> · {entry.matched}</span>
                ) : null}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RequirementRow({
  index,
  requirement,
}: {
  index: number;
  requirement: VerifiedRequirement;
}) {
  const style = LEVEL_STYLES[requirement.level];
  const Icon = style.icon;

  return (
    <Card
      className="flex flex-col gap-2 p-3"
      data-testid={requirementRowTestId(index)}
    >
      {/* The requirement is the model's reading of a posting, so it can be a long
          run of unbroken characters. `min-w-0` + `wrap-anywhere` keep it inside
          the card instead of setting the card's width. */}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] wrap-anywhere">{requirement.text}</p>
        <span
          className={`flex shrink-0 items-center gap-1 text-xs ${style.className}`}
        >
          <Icon className="size-3.5" aria-hidden />
          {style.label}
        </span>
      </div>

      <p className="text-xs text-muted wrap-anywhere">{requirement.note}</p>

      {requirement.evidence.length > 0 ? (
        // Every match points at something. These are links because the natural
        // next move after reading "Partial" is to go and strengthen the entry
        // it was judged against.
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">From</span>
          {requirement.evidence.map((ref) => (
            <Link
              key={ref.id}
              href="/profile"
              className="max-w-full rounded-full border border-border px-2 py-0.5 text-xs wrap-anywhere underline-offset-3 hover:underline"
            >
              {ref.label}
            </Link>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

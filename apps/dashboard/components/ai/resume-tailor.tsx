"use client";

import {
  hasEmphasis,
  type ProfileChange,
  type TailorEmphasisInput,
  type TailorReview,
} from "@resfolio/profile";
import { Button, Card, Spinner } from "@resfolio/ui";
import { ArrowUpDown, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  applyTailoringAction,
  clearTailoringAction,
} from "@/app/(dashboard)/ai/tailor-actions";
import { tailorApplyTestId, tailorChangeTestId, TEST_IDS } from "@/lib/testids";

import { ChangeCard } from "./change-diff";

/**
 * Job tailoring's **review half** (docs/architecture/13-ai-layer.md, Phase 5).
 *
 * **The trigger moved out; the review stayed.** Until the 2026-07-28 unification
 * this file also owned a "Tailor for this job" button sitting in the artefact
 * panel — a second entry point, beside a second textarea's worth of context, for
 * a decision the user had apparently already made by pressing "Enhance profile
 * for this job" in the chat. They were never the same action (one edits the
 * permanent record conservatively, one overrides one document aggressively), but
 * nothing on screen said so, so it read as being charged twice for one job. There
 * is now one button and one question — *where should this land* — and it lives in
 * `optimise-for-job.tsx`. This file renders what comes back.
 *
 * **The destination is still the whole point of this screen.** Everything the
 * user accepts here lands on one resume's view definition — a set of overrides —
 * and their profile keeps the words they wrote. That is what makes tailoring safe
 * to do ten times for ten postings, and it is stated on screen rather than left as
 * an architectural fact, because a user who thinks this is editing their profile
 * will use it far more timidly than they should.
 *
 * Where it differs from the Phase 3 review, and why:
 *
 * - **Content changes keep per-change consent; reordering gets one button.** The
 *   asymmetry is not laziness. A rewrite can put a sentence on a resume that the
 *   user has not read, so each one is accepted individually. A reorder cannot
 *   state anything — the same entries, a different sequence — so per-item consent
 *   there would be ceremony charging six clicks for a decision with no downside.
 * - **A public resume is warned about.** Documents have no draft/publish split:
 *   applying is live at `/r/<handle>` the moment it lands. That is a consequence
 *   the user should meet before clicking, not after.
 * - **An already-tailored resume says so, with a way out.** Tailoring is
 *   cumulative — a second pass leaves the first pass' overrides on every field it
 *   doesn't touch — so a resume carrying two postings' worth of tailoring is
 *   tailored for neither. The count, and Reset, are how that stops being a trap.
 */

/** What the page knows about a tailorable resume. Deliberately three fields: the
 * config, the template and the profile are none of this screen's business. */
export interface TailorTarget {
  id: string;
  name: string;
  isPublic: boolean;
  /** How many fields this resume already overrides (`countTailoredFields`). */
  tailoredFields: number;
}

/**
 * A resume that already carries overrides, with the way out.
 *
 * **Kept when `ResumeTailor` was removed, and moved to where the resume is
 * rather than where the tailoring is triggered.** Tailoring is cumulative — a
 * second pass leaves the first pass' overrides on every field it does not touch —
 * so a resume tailored for two postings is tailored for neither, and the count
 * plus Reset is the only thing that stops that being a trap. That is a fact about
 * a *document*, true whether or not you are looking at a job, so it belongs on
 * the resume card in the artefact panel.
 */
export function TailoredNotice({
  documentId,
  count,
  onCleared,
}: {
  documentId: string;
  count: number;
  onCleared: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      const result = await clearTailoringAction({ documentId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Back to your profile's wording.");
      onCleared();
    } finally {
      setClearing(false);
    }
  }

  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
      data-testid={TEST_IDS.tailorExisting}
    >
      <span>
        This resume already overrides {count} {count === 1 ? "field" : "fields"}{" "}
        — probably for a different posting.
      </span>
      <button
        type="button"
        disabled={clearing}
        onClick={() => void clear()}
        className="underline underline-offset-3 transition-colors duration-(--duration-fast) ease-out hover:text-foreground disabled:opacity-60"
        data-testid={TEST_IDS.tailorReset}
      >
        {clearing ? "Resetting…" : "Reset to your profile's wording"}
      </button>
    </p>
  );
}

const SECTION_LABELS: Record<string, string> = {
  experience: "Work Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  writing: "Writing",
  certifications: "Certifications",
  awards: "Awards",
  languages: "Languages",
  custom: "Custom sections",
};

export function TailorReviewPanel({
  documentId,
  resumeName,
  review,
  onApplied,
}: {
  documentId: string;
  resumeName: string;
  review: TailorReview;
  onApplied: () => void;
}) {
  const [applied, setApplied] = useState<ReadonlySet<number>>(new Set());
  const [orderApplied, setOrderApplied] = useState(false);
  const [pending, setPending] = useState<number | "all" | "order" | null>(null);

  const outstanding = review.changes.valid
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !applied.has(index));

  const reorders = hasEmphasis(review.emphasis);

  async function apply(
    scope: number | "all" | "order",
    changes: ProfileChange[],
    emphasis: TailorEmphasisInput | null,
  ) {
    setPending(scope);
    try {
      const result = await applyTailoringAction({
        documentId,
        changes,
        emphasis,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (scope === "order") {
        setOrderApplied(true);
      } else {
        const indexes =
          scope === "all" ? outstanding.map(({ index }) => index) : [scope];
        setApplied((current) => new Set([...current, ...indexes]));
      }
      toast.success(`Applied to ${resumeName}.`);
      onApplied();
    } finally {
      setPending(null);
    }
  }

  function applyChanges(indexes: number[], scope: number | "all") {
    void apply(
      scope,
      indexes.map(
        (index) => review.changes.valid[index]?.change as ProfileChange,
      ),
      null,
    );
  }

  if (review.changes.valid.length === 0 && !reorders) {
    return (
      <Card
        className="flex items-start gap-2 p-3 text-[13px] text-muted"
        data-testid={TEST_IDS.tailorEmpty}
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {review.changes.rejected.length > 0
            ? "Nothing to apply — every rewrite would have added information your profile doesn't contain."
            : "This resume already reads well for this posting. Nothing worth changing."}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid={TEST_IDS.tailorReview}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-section">
          For {resumeName}
          {review.changes.valid.length > 0
            ? ` · ${review.changes.valid.length} ${review.changes.valid.length === 1 ? "rewrite" : "rewrites"}`
            : ""}
        </p>
        {outstanding.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() =>
              applyChanges(
                outstanding.map(({ index }) => index),
                "all",
              )
            }
            data-testid={TEST_IDS.tailorApplyAll}
          >
            {pending === "all" ? <Spinner size="sm" /> : null}
            Apply all
          </Button>
        ) : null}
      </div>

      {review.changes.valid.map((entry, index) => (
        <ChangeCard
          key={index}
          testId={tailorChangeTestId(index)}
          applyTestId={tailorApplyTestId(index)}
          label={entry.label}
          field={entry.change.field}
          reason={entry.change.reason}
          before={entry.before}
          after={entry.after}
          applied={applied.has(index)}
          pending={pending === index || pending === "all"}
          disabled={pending !== null}
          onApply={() => applyChanges([index], index)}
        />
      ))}

      {reorders ? (
        <Card
          className="flex flex-col gap-3 p-3"
          data-testid={TEST_IDS.tailorEmphasis}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <ArrowUpDown className="size-3.5 text-muted" aria-hidden />
                What this resume leads with
              </p>
              <p className="text-xs text-muted">
                Nothing is hidden — only moved.
              </p>
            </div>
            {orderApplied ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-live">
                <Check className="size-3.5" aria-hidden />
                Applied
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending !== null}
                onClick={() =>
                  void apply("order", [], {
                    sectionOrder: review.emphasis.sectionOrder,
                    // Ids only: a label arriving back from a browser is text the
                    // server would have to trust, and it needs none of it.
                    sections: review.emphasis.sections.map((entry) => ({
                      section: entry.section,
                      itemIds: entry.items.map((item) => item.id),
                    })),
                  })
                }
                data-testid={TEST_IDS.tailorEmphasisApply}
              >
                {pending === "order" ? <Spinner size="sm" /> : null}
                Apply
              </Button>
            )}
          </div>

          {review.emphasis.sectionOrder.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">Section order</p>
              <p className="text-[13px]">
                {review.emphasis.sectionOrder
                  .map((key) => SECTION_LABELS[key] ?? key)
                  .join(" → ")}
              </p>
            </div>
          ) : null}

          {review.emphasis.sections.map((entry) => (
            <div key={entry.section} className="flex flex-col gap-1">
              <p className="text-xs text-muted">
                {SECTION_LABELS[entry.section] ?? entry.section}
              </p>
              <ol className="flex list-decimal flex-col gap-0.5 pl-4 text-[13px]">
                {entry.items.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ol>
            </div>
          ))}
        </Card>
      ) : null}

      {review.changes.rejected.length > 0 ? (
        <p
          className="flex items-start gap-1.5 text-xs text-muted"
          data-testid={TEST_IDS.tailorRejected}
        >
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {review.changes.rejected.length}{" "}
          {review.changes.rejected.length === 1
            ? "rewrite was"
            : "rewrites were"}{" "}
          dropped for adding information your profile doesn&apos;t have.
        </p>
      ) : null}

      {(applied.size > 0 || orderApplied) && (
        <p className="text-xs text-muted">
          Applied to this resume only.{" "}
          <Link
            href={`/resumes/${documentId}`}
            className="text-brand hover:underline"
          >
            Open it
          </Link>{" "}
          to see the result, or download the PDF from there.
        </p>
      )}
    </div>
  );
}

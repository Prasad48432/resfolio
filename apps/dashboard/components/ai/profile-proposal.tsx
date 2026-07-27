"use client";

import { Button, Card, Spinner } from "@resfolio/ui";
import type { ProfileChange, ProfileChangeReview } from "@resfolio/profile";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { applyProfileChangesAction } from "@/app/(dashboard)/ai/actions";
import {
  proposalChangeTestId,
  proposalApplyTestId,
  TEST_IDS,
} from "@/lib/testids";

import { ChangeCard } from "./change-diff";

/**
 * The review surface (docs/architecture/13-ai-layer.md, Phase 3).
 *
 * **This screen is the product.** Everything upstream of it â€” the schema with
 * no add variant, the growth rules, the re-parse through the section's own Zod
 * â€” exists so that what lands here is worth reading rather than worth
 * distrusting. What lands here still does not get written until someone clicks.
 *
 * The diff itself is `ChangeCard` (`change-diff.tsx`), shared with the Phase 5
 * tailoring review â€” the per-change Apply button and the quiet, un-coloured
 * before/after are documented there, because both surfaces depend on them.
 *
 * What is specific to this screen:
 *
 * - **Apply all is secondary, and only appears above two outstanding changes.**
 * - **Refused suggestions are counted out loud.** The guard dropping two
 *   changes is the feature working, and a user who never learns it happened
 *   cannot tell this product from one that would have written "Kubernetes" into
 *   their skills. The detail stays server-side; the count does not.
 */
export function ProfileProposal({ review }: { review: ProfileChangeReview }) {
  const [applied, setApplied] = useState<ReadonlySet<number>>(new Set());
  const [pending, setPending] = useState<number | "all" | null>(null);

  const outstanding = review.valid
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !applied.has(index));

  async function apply(indexes: number[], scope: number | "all") {
    setPending(scope);
    try {
      const result = await applyProfileChangesAction({
        changes: indexes.map(
          (index) => review.valid[index]?.change as ProfileChange,
        ),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setApplied((current) => new Set([...current, ...indexes]));
      toast.success(
        result.data.applied === 1
          ? "Applied to your profile draft."
          : `Applied ${result.data.applied} changes to your profile draft.`,
      );
    } finally {
      setPending(null);
    }
  }

  if (review.valid.length === 0) {
    // The guard refused everything. This is a real outcome â€” the model tried to
    // add content â€” and it gets said plainly rather than rendered as an empty
    // card that looks like a bug.
    return (
      <Card
        className="flex items-start gap-2 p-3 text-[13px] text-muted"
        data-testid={TEST_IDS.aiProposalEmpty}
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          No changes to review â€” every suggestion would have added information
          your profile doesn&apos;t contain, so none of them were kept.
        </p>
      </Card>
    );
  }

  const everythingApplied = outstanding.length === 0;

  return (
    <div className="flex flex-col gap-2" data-testid={TEST_IDS.aiProposal}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-section">
          Suggested changes Â· {review.valid.length}
        </p>
        {outstanding.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() =>
              void apply(
                outstanding.map(({ index }) => index),
                "all",
              )
            }
            data-testid={TEST_IDS.aiProposalApplyAll}
          >
            {pending === "all" ? <Spinner size="sm" /> : null}
            Apply all
          </Button>
        ) : null}
      </div>

      {review.valid.map((entry, index) => (
        <ChangeCard
          key={index}
          testId={proposalChangeTestId(index)}
          applyTestId={proposalApplyTestId(index)}
          label={entry.label}
          field={entry.change.field}
          reason={entry.change.reason}
          before={entry.before}
          after={entry.after}
          applied={applied.has(index)}
          pending={pending === index || pending === "all"}
          disabled={pending !== null}
          onApply={() => void apply([index], index)}
        />
      ))}

      {review.rejected.length > 0 ? (
        <p
          className="flex items-start gap-1.5 text-xs text-muted"
          data-testid={TEST_IDS.aiProposalRejected}
        >
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {review.rejected.length}{" "}
          {review.rejected.length === 1 ? "suggestion was" : "suggestions were"}{" "}
          dropped for adding information your profile doesn&apos;t have.
        </p>
      ) : null}

      {everythingApplied ? (
        <p className="text-xs text-muted">
          Applied to your draft. Publish from the profile editor when
          you&apos;re ready.
        </p>
      ) : null}
    </div>
  );
}

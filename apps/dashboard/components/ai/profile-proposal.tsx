"use client";

import { Button, Card, Spinner } from "@resfolio/ui";
import type { ProfileChange } from "@resfolio/profile";
import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { applyProfileChangesAction } from "@/app/(dashboard)/ai/actions";
import type { ProposalOutput } from "@/lib/ai/tools";
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
 *
 * **`apply` is injectable, and this component is the reason the job flow did not
 * grow a second review UI.** A profile enhancement for a posting (Phase 7) is the
 * same consent, the same diff and the same guard — the only difference is that
 * the accepted changes are also recorded against the job. Copying this file to
 * change one import is how two screens that must look identical stop looking
 * identical; passing the action in is how they cannot.
 */
export function ProfileProposal({
  review,
  apply: applyChanges = applyProfileChangesAction,
}: {
  review: ProposalOutput;
  /** The write. Defaults to the plain profile apply; the job card passes
   * `applyJobEnhancementAction`, which does the same write and then records what
   * this posting caused. Both re-run the guard server-side — an injected action
   * is not an injected trust level. */
  apply?: (input: {
    changes: ProfileChange[];
  }) => Promise<
    | { ok: true; data: { applied: number; skipped: number } }
    | { ok: false; error: string }
  >;
}) {
  /**
   * Seeded from the server's reconciliation, so a reopened conversation shows
   * what it did rather than offering to do it again.
   *
   * **Seeded, not merged on every render.** `useState`'s initialiser runs once,
   * which is exactly right: `settledIndexes` is a fact about the profile as the
   * page loaded, and after that this component owns the set — a change the user
   * applies in this session belongs in the same collection as one they applied
   * last week, because the screen makes no distinction between them and neither
   * should the state.
   */
  const [applied, setApplied] = useState<ReadonlySet<number>>(
    () => new Set(review.settledIndexes ?? []),
  );
  const [pending, setPending] = useState<number | "all" | null>(null);

  const outstanding = review.valid
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !applied.has(index));

  /**
   * The two reasons a change is not on offer, which are opposite in meaning and
   * used to be reported as one number.
   *
   * `unchanged` means **the profile already says this** — either the user
   * accepted it (the common case, on a reopened conversation reconciled by
   * `reconcileTranscript`) or they had written the same thing themselves. Every
   * other reason means the guard **refused** it, which is the no-fabrication rule
   * doing its job. Lumping the first into "dropped for adding information your
   * profile doesn't have" told users their accepted changes had been rejected as
   * fabrication, which is close to the worst thing this screen could say.
   */
  const settled = review.rejected.filter(
    (entry) => entry.reason === "unchanged",
  ).length;
  const refused = review.rejected.length - settled;

  async function apply(indexes: number[], scope: number | "all") {
    setPending(scope);
    try {
      const result = await applyChanges({
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
    // Nothing left to offer, for one of two opposite reasons — and saying the
    // wrong one is worse than saying nothing. `settled` dominating means this is
    // a reopened conversation whose changes are in the profile; anything else
    // means the guard refused them.
    return (
      <Card
        className="flex items-start gap-2 p-3 text-[13px] text-muted"
        data-testid={TEST_IDS.aiProposalEmpty}
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {settled > 0 && refused === 0 ? (
          <p>
            {settled === 1
              ? "This change is already in your profile."
              : `These ${settled} changes are already in your profile.`}{" "}
            Nothing left to apply here.
          </p>
        ) : (
          <p>
            No changes to review â€” every suggestion would have added
            information your profile doesn&apos;t contain, so none of them were
            kept.
          </p>
        )}
      </Card>
    );
  }

  const everythingApplied = outstanding.length === 0;

  return (
    <div className="flex flex-col gap-2" data-testid={TEST_IDS.aiProposal}>
      <div className="flex items-center justify-between gap-3">
        {/* The count says what is left, not just what was proposed. With applied
            changes still on screen (they stay, marked — see
            `reconcileTranscript`) a bare "6" over four green Applied markers and
            two buttons is a number that answers no question anyone has. */}
        <p className="label-section">
          {outstanding.length === review.valid.length
            ? `Suggested changes Â· ${review.valid.length}`
            : `Suggested changes Â· ${outstanding.length} of ${review.valid.length} left`}
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

      {settled > 0 ? (
        <p
          className="flex items-start gap-1.5 text-xs text-muted"
          data-testid={TEST_IDS.aiProposalSettled}
        >
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {settled === 1
            ? "1 more is already in your profile."
            : `${settled} more are already in your profile.`}
        </p>
      ) : null}

      {refused > 0 ? (
        <p
          className="flex items-start gap-1.5 text-xs text-muted"
          data-testid={TEST_IDS.aiProposalRejected}
        >
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {refused} {refused === 1 ? "suggestion was" : "suggestions were"}{" "}
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

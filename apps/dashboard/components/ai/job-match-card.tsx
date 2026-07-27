"use client";

import {
  ENHANCE_CONFIRM_THRESHOLD,
  needsEnhanceConfirmation,
  type StoredAnalysis,
} from "@resfolio/job";
import type { ProfileChange, ProfileChangeReview } from "@resfolio/profile";
import { Button, Card, Spinner } from "@resfolio/ui";
import { ExternalLink, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  applyJobEnhancementAction,
  enhanceProfileForJobAction,
  saveJobMatchAction,
} from "@/app/(dashboard)/ai/job-actions";
import type { JobMatchReview } from "@/lib/ai/job-analysis";
import { TEST_IDS } from "@/lib/testids";

import { JobMatchResult } from "./job-match-result";
import { ProfileProposal } from "./profile-proposal";
import { MatrixSpinner } from "../status/matrix-loader";

/**
 * The job match, inside the conversation
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **This is what replaced `/ai/job`.** That route asked someone who had just
 * been talking to an assistant about their career to go somewhere else, paste
 * the posting into a second textarea, and lose the conversation. The match is now
 * a tool result like any other: paste a posting into the chat, the model calls
 * `analyzeJobMatch`, and this renders where the answer would have been.
 *
 * Three things it owns, and one it deliberately does not.
 *
 * **It persists itself.** The tool's `execute` is pure and has no database
 * access — an AI tool with a write path is the shape this architecture exists to
 * not have — so the row is written here, once, by an effect keyed on the job id.
 * The id was minted server-side inside the tool result and lives in the
 * transcript, so reopening this conversation next week re-saves the same job
 * rather than creating a second one.
 *
 * **The `<70%` warning is a confirmation, not a gate.** Below the threshold, the
 * honest reading is that this is not really the user's job, and rewriting a
 * career record to chase a role it does not fit should be a decision rather than
 * a click. Above it, the dialog would be a click charged for nothing, so there
 * isn't one. Nothing server-side consults the score: the enhancement is exactly
 * as constrained either way, because the constraint is the guard, not the number.
 *
 * **The re-check is asked for, never automatic.** A new score is a fresh model
 * judgement against the profile as it now reads — it costs a call, and firing one
 * the instant a change is applied spends the user's budget on a question they may
 * not have asked yet. So accepting changes ends with a prompt to ask the chat,
 * which is one sentence away and produces a new card with the improvement on it.
 *
 * What it does not own is the diff. Accepted changes go through `ProfileProposal`
 * — the same per-change consent, the same guard, the same component as a chat
 * proposal — with only the write injected, so this screen and that one cannot
 * drift into looking like different products with different rules.
 */
export function JobMatchCard({
  review,
  chatSessionId,
  onSaved,
}: {
  review: JobMatchReview;
  /** The conversation this match came out of. Recorded on the row so the panel
   * beside the chat can find it; carries no foreign key — see the domain. */
  chatSessionId: string;
  /** The panel's cue to refresh. Called after the row is written, so the panel
   * never renders a job the database does not have yet. */
  onSaved?: () => void;
}) {
  const [enhancement, setEnhancement] = useState<ProfileChangeReview | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [applied, setApplied] = useState(false);

  const { summary, jobId } = review;

  /**
   * Write the row, once.
   *
   * **The guard is a ref, not the state above**, because the effect must not
   * re-run when the card re-renders — and it re-renders on every token of the
   * sentence the model writes after the tool returns. Keyed on `jobId` so a
   * second match in the same conversation saves itself too.
   */
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (savedRef.current === jobId) {
      return;
    }
    savedRef.current = jobId;

    void saveJobMatchAction({
      id: jobId,
      chatSessionId,
      jobDescription: review.jobDescription,
      jobUrl: review.jobUrl,
      role: review.role,
      company: review.company,
      location: review.location,
      // Written on insert only — the baseline the "74% → 86%" claim is measured
      // against. A re-match writes `enhancedScore` through its own action.
      initialScore: summary.score,
      analysis: toStoredAnalysis(review),
    }).then((result) => {
      if (result.ok) {
        onSaved?.();
      }
      // A failed save is deliberately silent. The match is on screen and
      // readable; a toast saying the history write failed would be a
      // notification about a feature the user did not ask for, on top of an
      // answer they did. It is logged server-side.
    });
  }, [jobId, chatSessionId, review, summary.score, onSaved]);

  async function enhance() {
    setConfirming(false);
    setPending(true);
    setFailed(false);
    try {
      const result = await enhanceProfileForJobAction({
        jobId,
        jobDescription: review.jobDescription,
      });

      if (!result.ok) {
        setFailed(true);
        toast.error(result.error);
        return;
      }

      setEnhancement(result.data.review);
    } finally {
      setPending(false);
    }
  }

  function requestEnhance() {
    if (needsEnhanceConfirmation(summary.score)) {
      setConfirming(true);
      return;
    }
    void enhance();
  }

  return (
    <div className="flex flex-col gap-4" data-testid={TEST_IDS.jobMatchCard}>
      {review.jobUrl ? (
        // The posting, where the user left it. `normalizeJobUrl` in
        // `@resfolio/job` is what makes rendering a model-produced string as an
        // anchor safe — it refuses any scheme that is not http(s).
        <a
          href={review.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted underline-offset-3 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {review.company ? `${review.company} — the posting` : "The posting"}
        </a>
      ) : null}

      <JobMatchResult
        role={
          review.company ? `${review.role} · ${review.company}` : review.role
        }
        requirements={review.requirements}
        keywords={review.keywords}
        summary={summary}
        // Never streamed: the tool's output arrives whole, verified, and
        // already counted. The "hold the score back while chunks land" rule
        // belonged to the old route, where rows really did appear one at a time.
        showScore
      />

      {enhancement === null && !pending ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-fit"
            onClick={requestEnhance}
            data-testid={TEST_IDS.jobMatchEnhance}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Enhance profile for this job
          </Button>
          <p className="text-xs text-muted">
            Rewrites what&apos;s already in your profile so the relevant work
            leads. It never adds experience you don&apos;t have, and nothing is
            saved until you accept each change.
          </p>
        </div>
      ) : null}

      {confirming ? (
        // Inline rather than a modal, deliberately: this is a question about the
        // card it sits under, and a dialog would cover the score it is asking
        // about. It is also one of the few places in the product where the
        // quieter answer is the recommended one, so Cancel leads.
        <Card
          className="flex flex-col gap-3 border-brand/40 p-3"
          data-testid={TEST_IDS.jobMatchConfirm}
        >
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden
            />
            <p className="text-[13px]">
              This job currently matches less than {ENHANCE_CONFIRM_THRESHOLD}%
              of your profile. Are you sure you want to optimise your profile
              for this role?
            </p>
          </div>
          <p className="text-xs text-muted">
            Enhancing edits your real profile, not a copy — and it can only
            re-word what&apos;s already there, so a{" "}
            {summary.gap === 1 ? "gap" : "gaps"} the posting cares about will
            still be {summary.gap === 1 ? "a gap" : "gaps"} afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(false)}
              data-testid={TEST_IDS.jobMatchConfirmCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void enhance()}
              data-testid={TEST_IDS.jobMatchConfirmContinue}
            >
              Continue anyway
            </Button>
          </div>
        </Card>
      ) : null}

      {pending ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <MatrixSpinner />
          Reading the posting against your profile and rewriting what fits…
        </Card>
      ) : null}

      {failed ? (
        <Card
          className="p-3 text-[13px] text-destructive"
          data-testid={TEST_IDS.jobMatchEnhanceError}
        >
          That didn&apos;t go through. Nothing was changed — try again.
        </Card>
      ) : null}

      {enhancement ? (
        <div className="flex flex-col gap-2">
          <ProfileProposal
            review={enhancement}
            // Same consent, same guard, same diff — the only difference is that
            // this write also records what the posting caused against the job.
            apply={async ({ changes }: { changes: ProfileChange[] }) => {
              const result = await applyJobEnhancementAction({
                jobId,
                changes,
              });
              if (result.ok) {
                setApplied(true);
              }
              return result;
            }}
          />
          {applied ? (
            <p
              className="text-xs text-muted"
              data-testid={TEST_IDS.jobMatchRecheck}
            >
              Ask “recalculate the match” to see where that leaves you — it
              re-reads your profile as it now stands, so the new score is a real
              second opinion rather than an estimate of this one.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The review, in the shape the domain stores.
 *
 * A deliberate hand-mapping rather than a cast. `JobMatchReview` is what this app
 * computed; `StoredAnalysis` is what `@resfolio/job` keeps, and the two are
 * separate schemas on purpose (see that package's CLAUDE.md) — so the boundary
 * gets a function that would fail to compile if either side moved, instead of an
 * `as` that would not.
 */
function toStoredAnalysis(review: JobMatchReview): StoredAnalysis {
  return {
    requirements: review.requirements.map((requirement) => ({
      text: requirement.text,
      level: requirement.level,
      note: requirement.note,
      evidence: requirement.evidence.map((ref) => ({
        id: ref.id,
        section: ref.section,
        label: ref.label,
      })),
      downgraded: requirement.downgraded,
    })),
    keywords: review.keywords.map((entry) => ({
      keyword: entry.keyword,
      present: entry.present,
    })),
    summary: review.summary,
  };
}

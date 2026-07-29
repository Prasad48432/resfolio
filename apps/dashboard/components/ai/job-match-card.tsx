"use client";

import type { StoredAnalysis } from "@resfolio/job";
import { useEffect, useRef } from "react";

import { saveJobMatchAction } from "@/app/(dashboard)/ai/job-actions";
import type { JobFacts } from "@/lib/ai/job-facts";
import type { JobMatchReview } from "@/lib/ai/job-analysis";
import { TEST_IDS } from "@/lib/testids";

import { ApplyPrompt } from "./apply-prompt";
import { JobMatchResult } from "./job-match-result";
import { OptimiseForJob } from "./optimise-for-job";
import type { TailorTarget } from "./resume-tailor";

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
 * Two things it owns, and two it deliberately does not.
 *
 * **It persists itself.** The tool's `execute` is pure and has no database
 * access — an AI tool with a write path is the shape this architecture exists to
 * not have — so the row is written here, once, by an effect keyed on the job id.
 * The id was minted server-side inside the tool result and lives in the
 * transcript, so reopening this conversation next week re-saves the same job
 * rather than creating a second one.
 *
 * **What it does not own is the optimisation, and that is the 2026-07-28
 * change.** This card used to carry an "Enhance profile for this job" button
 * while the artefact panel carried a "Tailor for this job" one — two entry
 * points, two model calls, two sets of rewrites of the same sentences, and
 * nothing on screen explaining that they wrote to different places.
 * `OptimiseForJob` asks the one question those two buttons were the unasked
 * answer to: profile, or this resume? Read that file's header before changing
 * this. The `<70%` confirmation and the recheck prompt moved with it.
 *
 * **It does not own the diff either.** Accepted changes go through
 * `ProfileProposal` — the same per-change consent, the same guard, the same
 * component as a chat proposal — so this screen and that one cannot drift into
 * looking like different products with different rules.
 */
export function JobMatchCard({
  review,
  chatSessionId,
  resumes = [],
  facts,
  onSaved,
}: {
  review: JobMatchReview;
  /** The conversation this match came out of. Recorded on the row so the panel
   * beside the chat can find it; carries no foreign key — see the domain. */
  chatSessionId: string;
  /** The user's resumes, four fields each — the "this resume only" destination
   * needs something to point at. Not the documents: a `ViewDefinition` in a
   * browser bundle to answer a question about a name is the trade this avoids. */
  resumes?: TailorTarget[];
  /**
   * What has already happened to this job, read from the database by the
   * workspace (`lib/ai/job-facts.ts`).
   *
   * **Without it the offers came back every time the conversation was
   * reopened.** The transcript stores the tool result, not what the user did with
   * it, so a card rendered from history has no memory of the enhancement it
   * produced, the resume it was pointed at, or the application it became — and a
   * button offering to redo something already done is a button that reads as the
   * product having forgotten. In-session state covers the same cases before a
   * refresh; this covers them after.
   *
   * Absent on the turn that produced the match, because the row is written by the
   * effect below and the panel has not re-read it yet. That is correct: a match
   * that just arrived has had nothing done to it.
   */
  facts?: JobFacts;
  /** The panel's cue to refresh. Called after the row is written **and** after an
   * optimisation is applied — the second matters because applying records the
   * changes against the job, which is what `hasEnhancement` reads. */
  onSaved?: () => void;
}) {
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

  return (
    <div className="flex flex-col gap-4" data-testid={TEST_IDS.jobMatchCard}>
      {review.jobUrl ? (
        // The posting, where the user left it — and, once they have gone to look
        // at it, the one question the tracker needs answered. `normalizeJobUrl`
        // in `@resfolio/job` is what makes rendering a model-produced string as
        // an anchor safe: it refuses any scheme that is not http(s).
        <ApplyPrompt
          jobId={jobId}
          jobUrl={review.jobUrl}
          label={
            review.company ? `${review.company} — the posting` : "The posting"
          }
          status={facts?.status ?? "saved"}
          onChanged={onSaved}
        />
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

      {/* One button, one question — see `optimise-for-job.tsx`. The two entry
          points this replaced ("Enhance profile for this job" here, "Tailor for
          this job" in the artefact panel) were different actions that looked like
          the same one, so the honest reading of the UI was that you paid twice
          for one job.

          It is rendered even once this posting has been enhanced for: the card
          withdraws only the branch that is spent, and switching to a resume is
          still a real thing to do afterwards. */}
      <OptimiseForJob
        jobId={jobId}
        jobDescription={review.jobDescription}
        score={summary.score}
        resumes={resumes}
        alreadyEnhanced={facts?.hasEnhancement ?? false}
        tailoredResumeId={facts?.resumeDocumentId ?? null}
        onApplied={onSaved}
      />
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

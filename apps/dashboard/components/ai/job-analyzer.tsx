"use client";

import { useObject } from "@ai-sdk/react";
import type { ProfileItemRef } from "@resfolio/profile";
import { Button, Card, Spinner, Textarea } from "@resfolio/ui";
import { ShieldCheck, Square } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  coverKeywords,
  indexProfileItems,
  jobAnalysisSchema,
  summarizeMatch,
  verifyRequirement,
  type RawRequirement,
  type VerifiedRequirement,
} from "@/lib/ai/job-analysis";
import { MAX_JD_CHARS } from "@/lib/ai/limits";
import { TEST_IDS } from "@/lib/testids";

import { CoverLetter } from "./cover-letter";
import { JobMatchResult } from "./job-match-result";
import { ResumeTailor, type TailorTarget } from "./resume-tailor";

/**
 * The job-match surface (docs/architecture/13-ai-layer.md, Phase 4).
 *
 * `useObject` streams a partial `JobAnalysis`, so requirements land one at a
 * time rather than after twenty seconds of nothing. **Everything shown about a
 * requirement is verified before it renders**, which is possible only because
 * the schema puts `evidence` before `level`: structured output arrives in
 * schema order, so by the time a row has a level, its citations are complete
 * and can be resolved. A row therefore never displays a verdict that later
 * flips — the analysis does not appear to change its mind.
 *
 * **The score waits for the end.** A running percentage recomputed on every
 * chunk is a number that jumps while you read it, and it would be the one
 * element on screen that means something different a second later.
 *
 * **This component owns the posting, so Phases 5 and 6 live inside it.** The
 * analysis, the resume tailoring and the cover letter are three questions about one
 * pasted job description; giving each panel its own textarea would be the surest
 * way to have them disagree about which job the user meant. Both appear once there
 * is an analysis to read — writing a letter before knowing where the gaps are is
 * the wrong order of operations, not a shortcut.
 *
 * That makes this one page a sequence — read the posting, fit the resume, write the
 * letter — which is the actual shape of applying for a job, and the reason none of
 * the three earned a route of its own.
 */
export function JobAnalyzer({
  items,
  haystack,
  resumes,
  signature,
}: {
  items: ProfileItemRef[];
  haystack: string;
  resumes: TailorTarget[];
  /** The profile's own name, for signing a letter. */
  signature: string;
}) {
  const [jobDescription, setJobDescription] = useState("");

  /**
   * The stream ended and produced no usable analysis.
   *
   * **This state exists because its absence was indistinguishable from a hang.**
   * `useObject` sets `error` only when the *request* fails; a request that
   * succeeds and streams an object that never satisfies the schema — the shape a
   * generation stopped by its token ceiling takes — simply flips `isLoading` to
   * false with `object` still undefined. Every panel below is conditioned on
   * having a result, so the screen went from "Reading the posting…" to nothing at
   * all, with no error and nothing to click. A call that was billed must say what
   * happened.
   */
  const [emptyResult, setEmptyResult] = useState(false);

  const index = useMemo(() => indexProfileItems(items), [items]);

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/ai/job",
    schema: jobAnalysisSchema,
    // `object` here is the *validated* final value, so undefined is exactly the
    // "arrived but unusable" case. `error` carries the validation failure when
    // there is one; either way the user gets a sentence rather than silence.
    onFinish: ({ object: final }) => {
      setEmptyResult(final === undefined);
    },
  });

  /**
   * The rows that are finished, verified against this profile.
   *
   * A streamed entry is incomplete for most of its life — `text` before
   * `evidence` before `level`. Anything without a level is still being written,
   * so it is not rendered at all rather than rendered as a placeholder that
   * changes shape.
   */
  const requirements: VerifiedRequirement[] = useMemo(() => {
    const streamed = object?.requirements ?? [];
    return streamed
      .filter(
        (entry): entry is RawRequirement =>
          entry !== undefined &&
          typeof entry.text === "string" &&
          typeof entry.level === "string" &&
          Array.isArray(entry.evidence),
      )
      .map((entry) =>
        verifyRequirement(
          { ...entry, note: entry.note ?? "", evidence: entry.evidence ?? [] },
          index,
        ),
      );
  }, [object?.requirements, index]);

  const keywords = useMemo(() => {
    const streamed = (object?.keywords ?? []).filter(
      (keyword): keyword is string => typeof keyword === "string",
    );
    return coverKeywords(streamed, haystack);
  }, [object?.keywords, haystack]);

  const summary = useMemo(() => summarizeMatch(requirements), [requirements]);

  const canSubmit = jobDescription.trim().length > 0 && !isLoading;
  const hasResult = requirements.length > 0 || keywords.length > 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setEmptyResult(false);
    submit({ jobDescription: jobDescription.trim() });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Textarea
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          rows={8}
          maxLength={MAX_JD_CHARS}
          placeholder="Paste the job description here — the whole posting is fine, the boilerplate gets ignored."
          aria-label="Job description"
          className="resize-y"
          data-testid={TEST_IDS.jobInput}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Nothing here is saved yet, and your profile is never changed by an
            analysis.
          </p>
          {isLoading ? (
            // Stop is a cost control, not a courtesy: the route passes the
            // request signal to the model, so cancelling stops generation.
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => stop()}
              data-testid={TEST_IDS.jobStop}
            >
              <Square className="size-3.5" aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              data-testid={TEST_IDS.jobSubmit}
            >
              Analyse
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <Card
          className="flex items-start gap-2 p-3 text-[13px] text-destructive"
          data-testid={TEST_IDS.jobError}
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            That analysis didn&apos;t go through. Try again — nothing was
            changed.
          </p>
        </Card>
      ) : null}

      {isLoading && !hasResult ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <Spinner size="sm" />
          Reading the posting against your profile…
        </Card>
      ) : null}

      {/* The analysis came back and there was nothing in it. Never rendered
          alongside the error card — that one covers a request that failed, this
          one a request that succeeded and produced no usable answer. */}
      {emptyResult && !isLoading && !error && !hasResult ? (
        <Card
          className="flex items-start gap-2 p-3 text-[13px] text-muted"
          data-testid={TEST_IDS.jobEmpty}
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            That analysis finished without a readable result — usually a very
            long posting. Try again, or paste just the requirements section.
          </p>
        </Card>
      ) : null}

      {hasResult ? (
        <JobMatchResult
          role={typeof object?.role === "string" ? object.role : ""}
          requirements={requirements}
          keywords={keywords}
          summary={summary}
          // Held back while chunks are still arriving: a percentage that
          // recomputes as rows land is a number that moves while it is read.
          showScore={!isLoading}
        />
      ) : null}

      {hasResult ? (
        <ResumeTailor
          targets={resumes}
          jobDescription={jobDescription}
          // A second model call while the first is still streaming spends two
          // budgets to answer half a question each.
          busy={isLoading}
        />
      ) : null}

      {hasResult ? (
        <CoverLetter
          items={items}
          haystack={haystack}
          jobDescription={jobDescription}
          signature={signature}
          busy={isLoading}
        />
      ) : null}
    </div>
  );
}

"use client";

import type { JobMatchRecord, JobMatchSummary } from "@resfolio/job";
import { scoreView } from "@resfolio/job";
import type { ProfileItemRef } from "@resfolio/profile";
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@resfolio/ui";
import { Briefcase, Download, FileText, Mail } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getJobMatchAction,
  listJobMatchesForChatAction,
  setJobResumeAction,
} from "@/app/(dashboard)/ai/job-actions";
import { downloadFile } from "@/lib/download";
import { TEST_IDS } from "@/lib/testids";

import { ApplyPrompt } from "./apply-prompt";
import { CoverLetter } from "./cover-letter";
import { TailoredNotice, type TailorTarget } from "./resume-tailor";

/**
 * The artefact panel — what the conversation produced
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **The chat is where the work happens; this is where the work ends up.** A
 * transcript scrolls, and the three things a person actually leaves with — the
 * posting they are applying to, the resume they will send, the letter that goes
 * with it — must not scroll away behind twenty turns of conversation. So they sit
 * beside it, pinned, in the order they are produced.
 *
 * **It reads the database, not the transcript**, and that is the distinction that
 * makes it worth having. The card in the conversation renders one tool result;
 * this renders the *job*, which outlives the message that created it and
 * accumulates a resume and a letter afterwards. Reopening the conversation next
 * week shows the letter that was written, not a button offering to write one.
 *
 * The resume is a **reference, never a copy** (see `@resfolio/job`): picking one
 * here stores its id, and downloading goes through the existing export route with
 * whatever that document says today. A job that pointed at a snapshot would be a
 * job proudly offering a version of the resume that exists nowhere else.
 */
export function JobPanel({
  chatSessionId,
  initialJobs,
  onJobs,
  items,
  haystack,
  signature,
  resumes,
  refreshToken,
}: {
  chatSessionId: string;
  /** Server-rendered on arrival; topped up by the action when a match saves
   * itself mid-conversation. */
  initialJobs: JobMatchSummary[];
  /**
   * Hand the freshly-read list back to the workspace.
   *
   * **This panel is the only thing that re-reads the job list, and the transcript
   * needs the same answers it gets.** A match card has to know whether its
   * posting has been enhanced for, which resume it was pointed at, and whether it
   * has been applied to — all facts on these rows, none of them in the
   * transcript. Before this, the cards read a list derived once from server props
   * and every refresh here was invisible to them. No extra request: this is the
   * result of a read that was already happening.
   */
  onJobs: (jobs: JobMatchSummary[]) => void;
  /** The profile item index, for the letter's citation check. */
  items: ProfileItemRef[];
  /** The profile as the model saw it — the letter's vocabulary haystack. */
  haystack: string;
  signature: string;
  /** The user's resumes as four fields each, not the documents — a
   * `ViewDefinition` in a browser bundle to answer a question about a name is
   * the trade this avoids. `tailoredFields` is what lets the tailoring panel say
   * a resume already carries overrides. */
  resumes: TailorTarget[];
  /** Bumped by the workspace when a job saves. Watched rather than passed a
   * callback, so this component never has to be re-created to stay current. */
  refreshToken: number;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [activeId, setActiveId] = useState<string | null>(
    initialJobs[0]?.id ?? null,
  );
  const [job, setJob] = useState<JobMatchRecord | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Bumped by every `refresh()`, and read by the record effect below.
   *
   * **Without it the panel refreshed the list and kept a stale record**, which is
   * the bug that made both downloads unreachable. The list and the open record
   * are two separate reads (listing forty jobs must not mean loading forty
   * postings), and the events worth refreshing on — a letter finishing, a resume
   * being picked — change *the record* while leaving the list identical: same
   * ids, same order, same active id. So the effect keyed on `activeId` had no
   * reason to re-run, `job.coverLetter` stayed null and `job.resumeDocumentId`
   * stayed unset, and the two buttons conditioned on them ("Download cover
   * letter", enabled "Download resume") never appeared until the whole page was
   * reloaded — which reads as "the PDF feature doesn't work".
   *
   * A counter rather than clearing `job`, because the record is on screen while
   * it reloads and a null would flash the panel back to its loading state.
   */
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(async () => {
    // Unconditional, and before the list read: an action failing is no reason to
    // keep showing a record we already know is out of date.
    setReloadToken((current) => current + 1);

    const result = await listJobMatchesForChatAction({ chatSessionId });
    if (!result.ok) {
      return;
    }
    setJobs(result.data.jobs);
    // Up as well as down: the match cards in the transcript answer their
    // "already done?" questions from this same list — see `onJobs`.
    onJobs(result.data.jobs);
    // Follow the newest job. A second posting pasted into the same conversation
    // is what the user is looking at now; leaving the panel on the first one
    // would make it describe a different job from the transcript beside it.
    setActiveId((current) => result.data.jobs[0]?.id ?? current);
  }, [chatSessionId, onJobs]);

  useEffect(() => {
    if (refreshToken === 0) {
      return;
    }
    void refresh();
  }, [refreshToken, refresh]);

  // The full record for whichever job is selected. Fetched separately because
  // the list deliberately does not carry job descriptions or letters — listing
  // forty jobs must not mean loading forty postings. Re-run on `reloadToken` as
  // well as `activeId`, because the interesting changes happen *inside* a record
  // the user is already looking at — see the token's own note above.
  useEffect(() => {
    if (activeId === null) {
      setJob(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getJobMatchAction({ jobId: activeId })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setJob(result.ok ? result.data.job : null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, refreshToken, reloadToken]);

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid={TEST_IDS.jobPanel}>
        <p className="label-section">This job</p>
        <Card className="p-3 text-[13px] text-muted">
          Paste a job posting into the chat — the description, and the link if
          you have one. The match, a tailored resume and a cover letter all end
          up here.
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.jobPanel}>
      <div className="flex items-center justify-between gap-2">
        <p className="label-section">This job</p>
        {jobs.length > 1 ? (
          <Select
            value={activeId ?? undefined}
            onValueChange={(value) => setActiveId(value)}
          >
            <SelectTrigger className="max-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {loading && job === null ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <Spinner size="sm" />
          Loading…
        </Card>
      ) : null}

      {job ? (
        <>
          <PostingCard job={job} onChanged={refresh} />
          <ResumeCard job={job} resumes={resumes} onChanged={refresh} />
          <LetterCard
            job={job}
            items={items}
            haystack={haystack}
            signature={signature}
            onSaved={refresh}
          />
        </>
      ) : null}
    </div>
  );
}

/** 1. The posting: where it is, and how well it fits. */
function PostingCard({
  job,
  onChanged,
}: {
  job: JobMatchRecord;
  onChanged: () => void;
}) {
  const { score, previous, delta } = scoreView(job);

  return (
    <Card
      className="flex flex-col gap-2 p-3"
      data-testid={TEST_IDS.jobPanelPosting}
    >
      <div className="flex items-start gap-2">
        <Briefcase className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{job.title}</p>
          {job.location ? (
            <p className="truncate text-xs text-muted">{job.location}</p>
          ) : null}
        </div>
        {score !== null ? (
          <p
            className="shrink-0 text-lg leading-none font-medium tabular-nums"
            data-testid={TEST_IDS.jobPanelScore}
          >
            {score}%
          </p>
        ) : null}
      </div>

      {/* The one comparison this product makes. Shown only when both numbers
          are real — "+12" against a baseline nobody measured is a claim rather
          than a measurement (`scoreView`). */}
      {delta !== null && previous !== null ? (
        <p
          className="text-xs text-muted tabular-nums"
          data-testid={TEST_IDS.jobPanelDelta}
        >
          {previous}% → {score}%{" "}
          <span className={delta > 0 ? "text-live" : undefined}>
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>{" "}
          after enhancing your profile
        </p>
      ) : null}

      {job.jobUrl ? (
        // Safe to render as an anchor because `normalizeJobUrl` refused
        // anything that is not http(s) before this was stored. The prompt that
        // follows it is the same component the match card uses — there are two
        // places to open a posting from and there must not be two answers to
        // "did you apply?".
        <ApplyPrompt
          jobId={job.id}
          jobUrl={job.jobUrl}
          label="Open the posting"
          status={job.status}
          onChanged={onChanged}
        />
      ) : (
        <p className="text-xs text-muted">
          No link saved — paste the posting&apos;s URL in the chat and it will
          be kept with this job.
        </p>
      )}
    </Card>
  );
}

/** 2. The resume: which one this application sends, and a way to get the file. */
function ResumeCard({
  job,
  resumes,
  onChanged,
}: {
  job: JobMatchRecord;
  resumes: TailorTarget[];
  onChanged: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = job.resumeDocumentId;
  const selectedResume = resumes.find((entry) => entry.id === selected);

  async function pick(documentId: string) {
    setSaving(true);
    try {
      const result = await setJobResumeAction({ jobId: job.id, documentId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    if (!selected) {
      return;
    }
    setDownloading(true);
    const pending = toast.loading("Generating your PDF…", {
      description: "This takes a few seconds.",
    });
    try {
      const result = await downloadFile(
        `/api/resumes/${encodeURIComponent(selected)}/pdf`,
        "resume.pdf",
      );
      if (!result.ok) {
        toast.error("Couldn't generate the PDF", {
          id: pending,
          description: result.error ?? "Please try again in a moment.",
        });
        return;
      }
      toast.success("Resume downloaded", {
        id: pending,
        description: "Check your downloads folder.",
      });
    } finally {
      setDownloading(false);
    }
  }

  if (resumes.length === 0) {
    return (
      <Card
        className="flex flex-col gap-2 p-3"
        data-testid={TEST_IDS.jobPanelResume}
      >
        <p className="flex items-center gap-2 text-[13px]">
          <FileText className="size-4 text-muted" aria-hidden />
          Resume
        </p>
        <p className="text-xs text-muted">
          You don&apos;t have a resume yet. One is a template plus your profile
          — it takes a click.
        </p>
        <Button asChild size="sm" variant="secondary" className="w-fit">
          <Link href="/resumes">Create a resume</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className="flex flex-col gap-2 p-3"
      data-testid={TEST_IDS.jobPanelResume}
    >
      <p className="flex items-center gap-2 text-[13px]">
        <FileText className="size-4 text-muted" aria-hidden />
        Resume
      </p>

      <Select
        value={selected ?? undefined}
        onValueChange={(value) => void pick(value)}
        disabled={saving}
      >
        <SelectTrigger data-testid={TEST_IDS.jobPanelResumePick}>
          <SelectValue placeholder="Choose the resume you'll send" />
        </SelectTrigger>
        <SelectContent>
          {resumes.map((resume) => (
            <SelectItem key={resume.id} value={resume.id}>
              {resume.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted">
        Rendered from your profile with that resume&apos;s own template — so
        enhancements you accepted are already in it.
      </p>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-fit"
        disabled={!selected || downloading}
        onClick={() => void download()}
        data-testid={TEST_IDS.jobPanelResumeDownload}
      >
        {downloading ? (
          <Spinner size="sm" />
        ) : (
          <Download className="size-3.5" aria-hidden />
        )}
        {downloading ? "Generating…" : "Download resume"}
      </Button>

      {/* **No "Tailor for this job" button here any more** (2026-07-28). The
          panel used to carry a second entry point to a second model call, beside
          the chat's "Enhance profile for this job" — two buttons for one job,
          with nothing on screen saying they wrote to different places.
          `OptimiseForJob` on the match card now asks the one question they were
          the unasked answer to.

          What stays is this: the *state* of the document. How many fields a
          resume overrides, and the way back, is a fact about the resume and is
          true whether or not you are looking at a job — so it belongs on the
          resume card, which is where a person looks when wondering why their
          resume does not say what their profile says. */}
      {selectedResume && selectedResume.tailoredFields > 0 ? (
        <TailoredNotice
          documentId={selectedResume.id}
          count={selectedResume.tailoredFields}
          onCleared={onChanged}
        />
      ) : null}
    </Card>
  );
}

/**
 * 3. The letter: written once, kept, and downloadable as a real PDF.
 *
 * **This card owns no Download button of its own, and used to.** `CoverLetter`
 * now receives the stored letter, so it renders one whether the draft arrived a
 * second ago or last week — and a second Download a few pixels below the first,
 * drawing the same letter through a different verb (`GET` the stored copy vs
 * `POST` the one on screen), is exactly the "two buttons, two formats" trap the
 * component's own comment warns about.
 */
function LetterCard({
  job,
  items,
  haystack,
  signature,
  onSaved,
}: {
  job: JobMatchRecord;
  items: ProfileItemRef[];
  haystack: string;
  signature: string;
  onSaved: () => void;
}) {
  return (
    <Card
      className="flex flex-col gap-3 p-3"
      data-testid={TEST_IDS.jobPanelLetter}
    >
      <p className="flex items-center gap-2 text-[13px]">
        <Mail className="size-4 text-muted" aria-hidden />
        Cover letter
      </p>

      <CoverLetter
        items={items}
        haystack={haystack}
        jobDescription={job.jobDescription}
        signature={signature}
        busy={false}
        jobId={job.id}
        saved={job.coverLetter}
        fallbackCompany={job.company ?? ""}
        fallbackRole={job.role ?? ""}
        onSaved={onSaved}
      />
    </Card>
  );
}

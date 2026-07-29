"use client";

import { useObject } from "@ai-sdk/react";
import type { CoverLetterContent } from "@resfolio/job";
import type { ProfileItemRef } from "@resfolio/profile";
import { Button, Card, Input, Label, Spinner } from "@resfolio/ui";
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  ShieldCheck,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  MAX_RECIPIENT_CHARS,
  assembleCoverLetter,
  coverLetterFilename,
  coverLetterGreeting,
  coverLetterSchema,
  coverLetterSignoff,
  verifyCoverLetter,
  type CoverLetterBodyParagraph,
} from "@/lib/ai/cover-letter";
// The same index the job analysis builds, for the same reason: a citation has to
// resolve to a name the user recognises, and one that resolves to nothing is how
// an unsupported claim is caught.
import { indexProfileItems } from "@/lib/ai/job-analysis";
import { downloadFile } from "@/lib/download";
import { saveCoverLetterAction } from "@/app/(dashboard)/ai/job-actions";
import { letterParagraphTestId, TEST_IDS } from "@/lib/testids";
import { MatrixSpinner } from "../status/matrix-loader";
import { WorkingText } from "../status/working-text";

/**
 * The cover-letter surface (docs/architecture/13-ai-layer.md, Phase 6).
 *
 * **Streaming is the product here, not a progress indicator.** A letter arriving
 * sentence by sentence is how a person reads one, and it is the only output in this
 * feature where that is true — a match score that assembles in public is a number
 * that moves while you read it, but prose composing itself is just prose.
 *
 * Three decisions worth not undoing:
 *
 * - **The greeting and the sign-off are composed here, not by the model.** There
 *   are no fields for them (`cover-letter.ts`), so an invented "Dear Ms. Chen" has
 *   nowhere to live and the user's own name cannot be misspelled. The recipient
 *   they type **never leaves the browser**: it is not in the request, so it is not
 *   sent to a provider and not in any log.
 * - **The flag list waits for the end.** Mid-stream, a half-written word is an
 *   unrecognised term, so scanning early would show warnings that vanish — the
 *   same reason Phase 4 holds its score back. Nothing about the check is hidden
 *   while it waits: there is simply nothing to say yet.
 * - **A flag is a question, not a verdict.** "Nothing in your profile or the
 *   posting mentions Rust" is true and useful; "this is a lie" would not be, since
 *   the user may well know Rust and never have written it down. The copy asks.
 *
 * **A finished letter replaces the form that produced it.** Once a letter exists —
 * streamed just now, or {@link CoverLetter.saved} loaded from the job — the
 * recipient field, the explanation and the "Write a cover letter" button all go
 * away, and what is left is the letter and the two things you do with one (copy,
 * download). A compose form sitting under a finished draft is a page still asking
 * for something it already has, and the reroll button next to it is an invitation
 * to spend a model call on a letter that was fine.
 *
 * The one control that survives is **Rewrite**, which brings the form back. It is
 * not a hedge: the form is now unreachable by any other route, so without it a
 * user who dislikes their first draft has no path forward at all — and "the
 * generated result is complete" is a statement about the default, not a promise
 * that the user is done.
 */
export function CoverLetter({
  items,
  haystack,
  jobDescription,
  signature,
  busy,
  jobId,
  saved,
  fallbackCompany = "",
  fallbackRole = "",
  onSaved,
}: {
  items: ProfileItemRef[];
  /** The profile as the model saw it. Unioned with the posting below, this is what
   * the vocabulary check runs against — a letter may draw on the user's career or
   * on the posting it answers, and nothing else. */
  haystack: string;
  jobDescription: string;
  /** The name the letter is signed with, from the profile's own basics. */
  signature: string;
  busy: boolean;
  /** The job this letter belongs to (Phase 7). With one, a finished letter is
   * saved against it and becomes downloadable as a PDF; without one — nothing
   * calls it that way today — the letter is still copy-and-paste only, which is
   * what it was for all of Phase 6. */
  jobId?: string;
  /**
   * The letter already stored against this job, if there is one.
   *
   * **This is what makes a reopened conversation show the letter rather than a
   * button offering to write one**, and it is why the compose form can be hidden
   * at all: without it, "has a letter" would mean "streamed one in this component's
   * lifetime", and every page load would present the form again over a letter the
   * user finished last week.
   *
   * Its `body` is plain strings — the stored shape drops per-paragraph evidence —
   * so a restored letter renders its prose and **not** the citation chips or the
   * flag list. Re-running the check against empty evidence would report every
   * paragraph as ungrounded, which is the check lying about a letter that passed.
   */
  saved?: CoverLetterContent | null;
  /** Names for the download's filename when the letter came from {@link saved},
   * which stores no role or company of its own. Ignored while a fresh letter is
   * on screen — the model's own reading of the posting is the better answer. */
  fallbackCompany?: string;
  fallbackRole?: string;
  /** The panel's cue that a letter now exists to draw. */
  onSaved?: () => void;
}) {
  const [recipient, setRecipient] = useState(saved?.recipient ?? "");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /** The user asked for another draft, so the form comes back. Cleared when the
   * next generation finishes, so the form hides itself again rather than lingering
   * over the letter it just produced. */
  const [rewriting, setRewriting] = useState(false);

  /** The stream ended with no usable letter. Same reasoning as the job panel's:
   * `useObject` reports `error` for a failed *request*, not for a successful one
   * whose object never validated — and without this the panel would go quiet
   * mid-draft with nothing to click. */
  const [emptyResult, setEmptyResult] = useState(false);

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/ai/cover-letter",
    schema: coverLetterSchema,
    onFinish: ({ object: final }) => {
      setEmptyResult(final === undefined);
      // Only on success. A generation that produced nothing leaves the form up,
      // because the next thing the user needs is the button they just pressed.
      if (final !== undefined) {
        setRewriting(false);
      }

      /**
       * Persist, once, when there is a job to persist against.
       *
       * **`onFinish`, not an effect on `object`** — the object is a new value on
       * every chunk, so an effect would fire per token and a `useRef` guard
       * would then have to encode "is this the same letter". This callback runs
       * exactly once per generation, with the validated final value, which is
       * the only version worth keeping.
       *
       * The recipient goes in the record but has never gone to a provider: it is
       * not in the request body (`{ jobDescription }` only), so the letter the
       * model wrote has no greeting in it and this is where the user's own text
       * is joined to it.
       */
      if (!jobId || final === undefined) {
        return;
      }

      void saveCoverLetterAction({
        jobId,
        letter: {
          opening: final.opening,
          body: final.body.map((paragraph) => paragraph.text),
          closing: final.closing,
          ...(recipient.trim() === "" ? {} : { recipient: recipient.trim() }),
        },
      }).then((result) => {
        if (result.ok) {
          onSaved?.();
        }
        // Quiet on failure, like the transcript's save: the letter is on screen
        // and copyable, and a toast about a storage write the user did not ask
        // for would be noise on top of the thing they did ask for.
      });
    },
  });

  const index = useMemo(() => indexProfileItems(items), [items]);

  /** The paragraphs that have text yet. Unlike a streamed requirement row, a
   * partial paragraph is safe to show: prose has no verdict that can flip, and
   * hiding it until complete would replace the whole point of streaming with a
   * spinner. */
  const body: CoverLetterBodyParagraph[] = useMemo(
    () =>
      (object?.body ?? [])
        .filter(
          (paragraph): paragraph is CoverLetterBodyParagraph =>
            paragraph !== undefined && typeof paragraph.text === "string",
        )
        .map((paragraph) => ({
          text: paragraph.text,
          evidence: (paragraph.evidence ?? []).filter(
            (id): id is string => typeof id === "string",
          ),
        })),
    [object?.body],
  );

  const opening = typeof object?.opening === "string" ? object.opening : "";
  const closing = typeof object?.closing === "string" ? object.closing : "";
  const role = typeof object?.role === "string" ? object.role : "";
  const company = typeof object?.company === "string" ? object.company : "";

  const greeting = coverLetterGreeting(recipient);
  const signoff = coverLetterSignoff(signature);

  /**
   * The verified letter — computed only once the stream is done.
   *
   * The haystack is the profile **plus the posting plus the recipient**: all three
   * are legitimate sources of a proper noun, and leaving the posting out would flag
   * the company name in every letter this feature ever writes.
   */
  const review = useMemo(() => {
    if (isLoading || (opening === "" && body.length === 0)) {
      return null;
    }
    return verifyCoverLetter(
      { opening, body, closing },
      index,
      `${haystack}\n${jobDescription}\n${recipient}`,
    );
  }, [
    isLoading,
    opening,
    body,
    closing,
    index,
    haystack,
    jobDescription,
    recipient,
  ]);

  /** A letter from *this* generation — the only one whose evidence and flag list
   * are real, and the only one that may still be arriving. */
  const hasLetter = opening !== "" || body.length > 0;
  /** Falling back to the stored one, which happens on every page load after the
   * first. */
  const restored = !hasLetter && saved != null ? saved : null;
  const hasAnyLetter = hasLetter || restored !== null;

  const shown = restored
    ? {
        opening: restored.opening,
        body: restored.body.map((text) => ({ text, evidence: [] })),
        closing: restored.closing,
        company: fallbackCompany,
        role: fallbackRole,
      }
    : {
        opening,
        body,
        closing,
        company: company || fallbackCompany,
        role: role || fallbackRole,
      };

  /**
   * Whether the compose form is on screen.
   *
   * Three ways in, and they are not the same case: there is nothing yet (the
   * ordinary first visit), a generation is running (the Stop button lives in this
   * card), or the user pressed Rewrite. Everything else — a finished letter, a
   * restored one — is a page with no form on it.
   */
  const composing = isLoading || rewriting || !hasAnyLetter;

  const canSubmit = jobDescription.trim().length > 0 && !busy && !isLoading;

  const plainText = assembleCoverLetter({
    greeting,
    opening: shown.opening,
    body: shown.body.map((paragraph) => paragraph.text),
    closing: shown.closing,
    signoff,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      // Reverts on its own: a permanently "Copied" button stops reporting the
      // next copy, which is the one the user is unsure about.
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Couldn't copy", {
        description: "Select the text and copy it by hand.",
      });
    }
  }

  /**
   * The letter as a real PDF, drawn by `pdf-lib` from what is on screen.
   *
   * **It posts the letter rather than asking the server for the stored one**, and
   * that is the whole reason this works. The save happens in `onFinish` through a
   * Server Action, and the panel only sees it on its next read — so a download
   * that fetched the stored copy would depend on a write and a refresh the user
   * cannot observe, and any hitch in either leaves a finished letter on screen
   * with no way to get it out. Sending the paragraphs makes the file depend on
   * the letter and nothing else.
   *
   * The greeting and sign-off are still **not** sent: the server composes both
   * from the profile and the recipient, exactly as the on-screen version does, so
   * there is no shape in which a name the model invented could reach the page.
   */
  async function downloadPdf() {
    if (!jobId) {
      return;
    }
    setDownloading(true);
    try {
      const result = await downloadFile(
        `/api/ai/job/${encodeURIComponent(jobId)}/cover-letter`,
        coverLetterFilename(shown.company, shown.role),
        {
          opening: shown.opening,
          body: shown.body.map((paragraph) => paragraph.text),
          closing: shown.closing,
          ...(recipient.trim() === "" ? {} : { recipient: recipient.trim() }),
        },
      );
      if (!result.ok) {
        toast.error("Couldn't build that PDF", {
          description: result.error ?? "Please try again in a moment.",
        });
      }
    } finally {
      setDownloading(false);
    }
  }

  /** The fallback where there is no job to draw against — Phase 6's behaviour,
   * unchanged. */
  function downloadText() {
    const blob = new Blob([plainText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = coverLetterFilename(shown.company, shown.role, "txt");
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.letterPanel}>
      {/* Hidden the moment there is a letter — see the component's header. */}
      {composing ? (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <p className="label-section">Cover letter</p>
            <p className="text-[13px] text-muted">
              Drafted from your profile and this posting. Every name and number
              in it has to come from one of the two —{" "}
              <span className="text-foreground">
                anything that doesn&apos;t is flagged
              </span>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-col gap-1.5">
              <Label htmlFor="letter-recipient">Addressed to (optional)</Label>
              <Input
                id="letter-recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                maxLength={MAX_RECIPIENT_CHARS}
                placeholder="Hiring Manager"
                data-testid={TEST_IDS.letterRecipient}
              />
            </div>

            {isLoading ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => stop()}
                data-testid={TEST_IDS.letterStop}
              >
                <Square className="size-3.5" aria-hidden />
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit}
                onClick={() => {
                  setEmptyResult(false);
                  submit({ jobDescription: jobDescription.trim() });
                }}
                data-testid={TEST_IDS.letterSubmit}
              >
                {hasAnyLetter ? "Write another draft" : "Write a cover letter"}
              </Button>
            )}
          </div>

          {/* Said plainly rather than implied, in both directions. Without a job
            this is Phase 6's behaviour and nothing is kept — a product that
            looked like it saved drafts would lose one. With a job, Phase 7 does
            keep it, and a warning to copy before leaving would send people
            hunting for something they cannot lose. */}
          <p className="text-xs text-muted">
            {jobId
              ? "Saved with this job when it finishes, and downloadable as a PDF."
              : "Nothing here is saved — copy it before you leave the page."}
          </p>

          {error ? (
            <p
              className="flex items-start gap-1.5 text-xs text-destructive"
              data-testid={TEST_IDS.letterError}
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              That draft didn&apos;t go through. Try again — nothing was
              changed.
            </p>
          ) : null}

          {emptyResult && !isLoading && !error && !hasLetter ? (
            <p
              className="flex items-start gap-1.5 text-xs text-muted"
              data-testid={TEST_IDS.letterEmpty}
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              That draft finished without producing a letter — usually a very
              long posting. Try again, or paste just the role and requirements.
            </p>
          ) : null}
        </Card>
      ) : null}

      {isLoading && !hasLetter ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <MatrixSpinner />
          <WorkingText kind="letter" />
        </Card>
      ) : null}

      {hasAnyLetter ? (
        <Card
          className="flex flex-col gap-4 p-4"
          data-testid={TEST_IDS.letterResult}
        >
          {/* **The actions are their own row, not a right-hand cluster.** This
              card renders at three widths — a 320px sheet on a phone, an 18rem
              rail on a laptop, the full column on a desktop — and three buttons
              opposite a title only fit at the third. Squeezed into the first they
              wrapped mid-group and the last one clipped, which is what "out of
              the box" looked like. A stacked header plus one wrapping row of
              equal-width-ish buttons is the same layout at every width, so there
              is nothing left to break. */}
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              {shown.role || shown.company ? (
                <p className="text-[13px] font-medium wrap-anywhere">
                  {[shown.role, shown.company].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="text-xs text-muted">
                {restored ? "Saved with this job" : "Draft"}
              </p>
            </div>
            {!isLoading ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy()}
                  data-testid={TEST_IDS.letterCopy}
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
                {/* The real thing where there is a job to draw it against, and
                    plain text only where there is not. One Download button
                    either way: two a few pixels apart, meaning two different
                    file formats, is how somebody sends the wrong one.
                    Labelled "Download", not "PDF" — a bare format name reads as a
                    format *switch* sitting next to Copy, and the format belongs in
                    the file it produces. */}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={downloading}
                  onClick={jobId ? () => void downloadPdf() : downloadText}
                  data-testid={TEST_IDS.letterDownload}
                >
                  {downloading ? (
                    <Spinner size="sm" />
                  ) : (
                    <Download className="size-3.5" aria-hidden />
                  )}
                  {jobId ? "Download PDF" : "Download .txt"}
                </Button>
                {/* The way back to the form this letter replaced. Quiet and last,
                    because it spends a model call and the default position is
                    that the letter on screen is finished. */}
                {!composing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted"
                    onClick={() => setRewriting(true)}
                    data-testid={TEST_IDS.letterRewrite}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Rewrite
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* The letter itself. A reading measure, because this is prose someone
              is about to send — not a form field. */}
          <div className="flex max-w-prose flex-col gap-4 text-[13px] leading-relaxed whitespace-pre-wrap">
            <p>{greeting}</p>
            {shown.opening ? <p>{shown.opening}</p> : null}
            {shown.body.map((paragraph, position) => (
              <Paragraph
                key={position}
                text={paragraph.text}
                evidence={review?.body[position]?.evidence ?? []}
                ungrounded={review?.body[position]?.ungrounded ?? false}
                testId={letterParagraphTestId(position)}
              />
            ))}
            {shown.closing ? <p>{shown.closing}</p> : null}
            <p>{signoff}</p>
          </div>

          {/* Present only for a letter generated in this session. A restored one
              carries no evidence ids (the stored shape drops them), so `review`
              is null for it by construction — which is right: re-running the
              check would report every paragraph as ungrounded, the check lying
              about a letter that passed. */}
          {review ? <Checks review={review} /> : null}
        </Card>
      ) : null}
    </div>
  );
}

function Paragraph({
  text,
  evidence,
  ungrounded,
  testId,
}: {
  text: string;
  evidence: ProfileItemRef[];
  ungrounded: boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <p>{text}</p>
      {evidence.length > 0 ? (
        // Links, because the natural next move after reading a claim is to check
        // the entry it was built from.
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">From</span>
          {evidence.map((ref) => (
            <Link
              key={ref.id}
              href="/profile"
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted underline-offset-3 hover:underline"
            >
              {ref.label}
            </Link>
          ))}
        </div>
      ) : ungrounded ? (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This paragraph doesn&apos;t point at anything in your profile — read
          it twice.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The checks, reported.
 *
 * **A clean result is stated, not left blank.** "Every name and number here
 * appears in your profile or the posting" is the most valuable sentence this
 * feature produces — it is the difference between a product that checked and a
 * product that shrugged — and a user who only ever sees the warning version cannot
 * tell which one they have.
 */
function Checks({
  review,
}: {
  review: NonNullable<ReturnType<typeof verifyCoverLetter>>;
}) {
  const numbers = review.unsupported.filter((flag) => flag.kind === "number");
  const names = review.unsupported.filter((flag) => flag.kind === "name");

  if (review.unsupported.length === 0 && review.ungroundedCount === 0) {
    return (
      <p
        className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted"
        data-testid={TEST_IDS.letterChecked}
      >
        <ShieldCheck
          className="mt-0.5 size-3.5 shrink-0 text-live"
          aria-hidden
        />
        Checked: every name and number in this letter appears in your profile or
        in the posting.
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 border-t border-border pt-3"
      data-testid={TEST_IDS.letterFlags}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        Worth checking before you send this
      </p>

      {review.unsupported.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted">
            {review.unsupported.length === 1
              ? "This term appears"
              : "These terms appear"}{" "}
            in neither your profile nor the posting. If you know{" "}
            {review.unsupported.length === 1 ? "it" : "them"}, add{" "}
            {review.unsupported.length === 1 ? "it" : "them"} to your profile —
            if not, cut{" "}
            {review.unsupported.length === 1
              ? "the sentence"
              : "those sentences"}
            .
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...names, ...numbers].map((flag) => (
              <span
                key={flag.term}
                className="rounded-full border border-brand/40 px-2 py-0.5 text-xs"
                title={
                  flag.kind === "number"
                    ? "A figure that appears nowhere in your profile or the posting"
                    : "A name that appears nowhere in your profile or the posting"
                }
              >
                {flag.term}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {review.ungroundedCount > 0 ? (
        <p className="text-xs text-muted">
          {review.ungroundedCount}{" "}
          {review.ungroundedCount === 1 ? "paragraph" : "paragraphs"} cite
          nothing in your profile, marked above.
        </p>
      ) : null}
    </div>
  );
}

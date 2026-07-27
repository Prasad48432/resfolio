"use client";

import { useObject } from "@ai-sdk/react";
import type { ProfileItemRef } from "@resfolio/profile";
import { Button, Card, Input, Label, Spinner } from "@resfolio/ui";
import { Check, Copy, Download, ShieldCheck, Square } from "lucide-react";
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
import { saveCoverLetterAction } from "@/app/(dashboard)/ai/job-actions";
import { letterParagraphTestId, TEST_IDS } from "@/lib/testids";
import { MatrixSpinner } from "../status/matrix-loader";

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
 */
export function CoverLetter({
  items,
  haystack,
  jobDescription,
  signature,
  busy,
  jobId,
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
  /** The panel's cue that a letter now exists to draw. */
  onSaved?: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [copied, setCopied] = useState(false);

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

  const hasLetter = opening !== "" || body.length > 0;
  const canSubmit = jobDescription.trim().length > 0 && !busy && !isLoading;

  const plainText = assembleCoverLetter({
    greeting,
    opening,
    body: body.map((paragraph) => paragraph.text),
    closing,
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

  function download() {
    const blob = new Blob([plainText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = coverLetterFilename(company, role);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.letterPanel}>
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <p className="label-section">Cover letter</p>
          <p className="text-[13px] text-muted">
            Drafted from your profile and this posting. Every name and number in
            it has to come from one of the two —{" "}
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
              {hasLetter ? "Write another draft" : "Write a cover letter"}
            </Button>
          )}
        </div>

        {/* Said plainly rather than implied: Phase 6 persists nothing, and a
            product that looked like it saved drafts would lose one. */}
        <p className="text-xs text-muted">
          Nothing here is saved — copy it before you leave the page.
        </p>

        {error ? (
          <p
            className="flex items-start gap-1.5 text-xs text-destructive"
            data-testid={TEST_IDS.letterError}
          >
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            That draft didn&apos;t go through. Try again — nothing was changed.
          </p>
        ) : null}

        {emptyResult && !isLoading && !error && !hasLetter ? (
          <p
            className="flex items-start gap-1.5 text-xs text-muted"
            data-testid={TEST_IDS.letterEmpty}
          >
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            That draft finished without producing a letter — usually a very long
            posting. Try again, or paste just the role and requirements.
          </p>
        ) : null}
      </Card>

      {isLoading && !hasLetter ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <MatrixSpinner />
          Reading the posting against your profile…
        </Card>
      ) : null}

      {hasLetter ? (
        <Card
          className="flex flex-col gap-4 p-4"
          data-testid={TEST_IDS.letterResult}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {role || company ? (
                <p className="truncate text-[13px] font-medium">
                  {[role, company].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="text-xs text-muted">Draft</p>
            </div>
            {!isLoading ? (
              <div className="flex shrink-0 items-center gap-2">
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={download}
                  data-testid={TEST_IDS.letterDownload}
                >
                  <Download className="size-3.5" aria-hidden />
                  .txt
                </Button>
              </div>
            ) : null}
          </div>

          {/* The letter itself. A reading measure, because this is prose someone
              is about to send — not a form field. */}
          <div className="flex max-w-prose flex-col gap-4 text-[13px] leading-relaxed whitespace-pre-wrap">
            <p>{greeting}</p>
            {opening ? <p>{opening}</p> : null}
            {body.map((paragraph, position) => (
              <Paragraph
                key={position}
                text={paragraph.text}
                evidence={review?.body[position]?.evidence ?? []}
                ungrounded={review?.body[position]?.ungrounded ?? false}
                testId={letterParagraphTestId(position)}
              />
            ))}
            {closing ? <p>{closing}</p> : null}
            <p>{signoff}</p>
          </div>

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

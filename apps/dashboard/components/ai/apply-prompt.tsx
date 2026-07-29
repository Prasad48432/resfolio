"use client";

import type { JobStatus } from "@resfolio/job";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@resfolio/ui";
import { Bookmark, Check, ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { setJobStatusAction } from "@/app/(dashboard)/ai/job-actions";
import { TEST_IDS } from "@/lib/testids";

/** Open the posting in its own tab, keeping the anchor's security posture.
 * Detached and clicked, exactly as `lib/download.ts` does — see `ApplyPrompt`
 * for why this is not `window.open`. */
function openPosting(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

/**
 * The posting's link, and the question that stands in front of it.
 *
 * **A tracker nobody fills in is worse than no tracker**, and the moment
 * somebody would fill one in is not "later, on another page" — it is the second
 * they decide to go and look at the posting. Every analysed posting is already a
 * row (status `saved`); this is the click that files it.
 *
 * Four decisions worth keeping:
 *
 * - **The click opens the question, and the answer opens the posting**
 *   (2026-07-29). This is the reverse of how it shipped. The first version let
 *   the navigation through and left the dialog waiting in the tab behind, on the
 *   theory that blocking a link teaches people not to press links — but the tab
 *   the dialog waits in is the tab the user has just left, so the question is
 *   asked of a screen nobody is looking at and is answered, if at all, by
 *   somebody who has come back and has to reconstruct what they were being asked
 *   about. Asking first costs one click on the way out; asking after costs a
 *   context switch back, which is the more expensive of the two and is the one
 *   people simply don't pay. The posting still opens in its own tab — the answer
 *   opens it — so nothing is lost but the order.
 * - **The tab is opened inside the answer's click handler, before the `await`,
 *   and by an anchor rather than `window.open`.** Two separate traps. A tab
 *   opened after a promise resolves has lost its user gesture and is blocked by
 *   every browser, which would turn "Yes, I applied" into a button that files
 *   the job and then appears to do nothing. And `window.open(url, "_blank",
 *   "noopener")` **returns `null` on success** — that is what `noopener` means —
 *   so the obvious "did it open?" check reports a blocked popup every single
 *   time. A detached `<a target="_blank" rel="noopener noreferrer">` gets both
 *   properties with no handle to misread; it is the same shape `lib/download.ts`
 *   uses, for the same reason.
 * - **A dialog, not an inline row and not a toast.** This started inline, which
 *   put the question below the fold of a narrow artefact panel — the place it is
 *   most often asked from — where it was easy to never see. A toast would be
 *   worse: doc 08's division of labour reserves those for events that happened,
 *   and a question that evaporates after five seconds is asked of nobody.
 * - **Both answers write, and asked once per job.** The question is "are you
 *   applying for this now?", but "no" is not a dismissal — someone who is opening
 *   a posting is keeping it, so No files it under **Saved** and Yes under
 *   **Applied**, and the board is correct either way with nothing to drag
 *   afterwards. It is only asked while the job is still `saved`; anything else
 *   means it has been answered, and the link is then an ordinary link that opens
 *   on the first click. Choosing No records the status the row already holds,
 *   which the domain treats as a no-op rather than a transition — so the flow
 *   view is never handed a hop that did not happen.
 */
export function ApplyPrompt({
  jobId,
  jobUrl,
  label,
  status,
  onChanged,
}: {
  jobId: string;
  /** Already through `normalizeJobUrl` — http(s) only — which is what makes
   * rendering a model-read string as an anchor safe. */
  jobUrl: string;
  label: string;
  status: JobStatus;
  /** The job row changed; whoever owns the list should re-read it. */
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<JobStatus | null>(null);
  const [tracked, setTracked] = useState<JobStatus | null>(null);

  /** Whether this click still has a question attached to it. Once the job has
   * moved on from `saved` — here or anywhere else — the anchor is just an
   * anchor. */
  const asks = status === "saved" && tracked === null;

  function handleLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!asks) return;
    // Modifier clicks and middle clicks are the user asking the *browser* for a
    // tab, not asking this app for anything. Intercepting them would break a
    // browser affordance to run a product flow, and the question survives —
    // the job is still `saved`, so the next plain click asks it.
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    setOpen(true);
  }

  async function answer(next: JobStatus) {
    openPosting(jobUrl);

    setPending(next);
    try {
      const result = await setJobStatusAction({ jobId, status: next });
      if (!result.ok) {
        toast.error("Couldn't update your tracker", {
          description: result.error,
        });
        return;
      }
      setTracked(next);
      setOpen(false);
      onChanged?.();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={jobUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted underline-offset-3 hover:underline"
      >
        <ExternalLink className="size-3.5" aria-hidden />
        {label}
      </a>

      <Dialog
        open={open}
        // Dismissing without answering is a cancel: the job stays in Saved,
        // which is where it already is, and the posting does not open. The link
        // is still there to press again — this is not a trap door.
        onOpenChange={(next) => {
          if (!next && pending === null) {
            setOpen(false);
          }
        }}
      >
        <DialogContent
          className="flex max-w-sm flex-col gap-4"
          data-testid={TEST_IDS.applyPrompt}
        >
          <div className="flex flex-col gap-1.5">
            <DialogTitle>Are you applying for this now?</DialogTitle>
            <DialogDescription>
              Either way the posting opens in a new tab and the job goes to your
              tracker — Applied if you&apos;re sending it now, Saved if
              you&apos;re just having a look.
            </DialogDescription>
          </div>

          {/* Yes leads. It is the answer somebody who is deliberately opening a
              posting is most likely giving, and it is the one that moves the
              job forward. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => void answer("applied")}
              data-testid={TEST_IDS.applyPromptApplied}
            >
              <Send className="size-4" aria-hidden />
              {pending === "applied" ? "Saving…" : "Yes, I'm applying"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending !== null}
              onClick={() => void answer("saved")}
              data-testid={TEST_IDS.applyPromptSaved}
            >
              <Bookmark className="size-4" aria-hidden />
              {pending === "saved" ? "Saving…" : "No, just looking"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Only after an answer given here — a job that arrived already applied
          says so on the board, and repeating it above every posting link would
          be chrome. */}
      {tracked ? (
        <p
          className="flex flex-wrap items-center gap-1.5 text-xs text-live"
          data-testid={TEST_IDS.applyPromptDone}
        >
          <Check className="size-3.5 shrink-0" aria-hidden />
          <span>
            Filed under {tracked === "applied" ? "Applied" : "Saved"} in your{" "}
            <Link href="/jobs" className="underline underline-offset-3">
              job tracker
            </Link>
            .
          </span>
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Building2, FileText, Mail } from "lucide-react";
import { useState } from "react";

import type { JobCardView } from "@/lib/jobs";
import { jobCardTestId } from "@/lib/testids";

/**
 * One application.
 *
 * **The whole card is the drag handle and also the button that opens the edit
 * sheet.** That works because the pointer sensor waits for six pixels of
 * movement before it claims the gesture (see `job-board.tsx`), so a click is a
 * click and a drag is a drag. A grip handle would be the alternative and is
 * wrong here: on a kanban board the card *is* the thing you move, and a card you
 * can only move by its corner is a card people try to move and fail to.
 *
 * `overlay` renders the copy that follows the cursor. It is not draggable and
 * not clickable — it is a picture of the card, and giving it its own listeners
 * would register a second draggable with the same id.
 */
export function JobCard({
  job,
  onEdit,
  overlay = false,
}: {
  job: JobCardView;
  onEdit: (job: JobCardView) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: job.id, disabled: overlay });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={
        overlay ? undefined : { transform: CSS.Translate.toString(transform) }
      }
      // The original stays in place and fades while its copy follows the cursor.
      // Removing it instead would collapse the column under the pointer and make
      // every other card jump.
      className={isDragging ? "opacity-40" : undefined}
    >
      <button
        type="button"
        {...(overlay ? {} : listeners)}
        {...(overlay ? {} : attributes)}
        onClick={() => onEdit(job)}
        data-testid={jobCardTestId(job.id)}
        className="flex w-full cursor-grab flex-col gap-2 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors duration-(--duration-fast) ease-out hover:border-muted active:cursor-grabbing"
      >
        <div className="flex items-start gap-2">
          <CompanyMark job={job} />
          <div className="min-w-0 flex-1">
            {/* `wrap-anywhere`, not truncation: a title is what identifies the
                card, and "Senior Software Engineer, Platform…" cut at the same
                point on four cards identifies none of them. */}
            <p className="line-clamp-2 text-[13px] leading-snug font-medium wrap-anywhere">
              {job.title}
            </p>
          </div>
          {job.score !== null ? (
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {job.score}%
            </span>
          ) : null}
        </div>

        {job.hasResume || job.hasCoverLetter ? (
          // What this application has ready. Icons rather than words: it is a
          // glance, and two labelled rows would be taller than the title.
          <div className="flex items-center gap-2 text-muted">
            {job.hasResume ? (
              <FileText className="size-3.5" aria-label="Resume chosen" />
            ) : null}
            {job.hasCoverLetter ? (
              <Mail className="size-3.5" aria-label="Cover letter written" />
            ) : null}
          </div>
        ) : null}
      </button>
    </div>
  );
}

/**
 * The company's favicon, or a fallback.
 *
 * **A plain `<img>`, not `next/image`** — see `faviconUrl` in `lib/jobs.ts`.
 * `referrerPolicy="no-referrer"` because the referrer would otherwise tell
 * Google which page of this app the request came from, which is more than the
 * icon needs.
 *
 * The fallback is state rather than an `onError` attribute that swaps `src`,
 * because a failed image whose `src` is rewritten can loop, and because the
 * fallback is a different element rather than a different picture.
 */
function CompanyMark({ job }: { job: JobCardView }) {
  const [broken, setBroken] = useState(false);

  if (job.faviconUrl === null || broken) {
    return (
      <span
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-accent"
        aria-hidden
      >
        <Building2 className="size-3 text-muted" />
      </span>
    );
  }

  return (
    // Deliberate, and the rule's own reasoning does not apply here: this is a
    // 16px icon on a third-party origin. `next/image` would proxy it through
    // the optimizer (a request per card, for a file smaller than the request),
    // need a `remotePatterns` entry, and buy no LCP improvement on an element
    // that is never the largest paint.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={job.faviconUrl}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      // `max-w-none`: Tailwind preflight sets `img { max-width: 100% }`, which
      // beats `width` and renders a 16px image inside a narrow flex box as an
      // ellipse. The shell's avatar hit exactly this.
      className="mt-0.5 size-4 max-w-none shrink-0 rounded-sm"
    />
  );
}

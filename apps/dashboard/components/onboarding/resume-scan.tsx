"use client";

import { cn } from "@resfolio/ui";
import { motion, useReducedMotion } from "framer-motion";

import { EASE_OUT } from "@/components/motion/motion";
import { MatrixSpinner } from "@/components/status/matrix-loader";
import { WorkingText } from "@/components/status/working-text";
import type { WorkKind } from "@/lib/ai/status-words";

/**
 * The document-scan surface shown while a resume is being read
 * (docs/architecture/16-onboarding.md).
 *
 * ## What it is allowed to claim
 *
 * **It is an activity indicator, not a progress bar, and that distinction is the
 * design.** Doc 13's "no fake progress" rule applies here with more force than
 * anywhere else in the product, because this is the one wait long enough (fifteen
 * to thirty seconds) that a bar would be *convincing*. There is no percentage, no
 * step counter, and no "3 of 5 — extracting skills": a single `generateObject`
 * call emits nothing at all until it is finished, so every intermediate number
 * would be invented, and a progress bar that stalls at 80% is a worse experience
 * than an honest one that never claimed to know.
 *
 * What it does have is **two real phases**, because there are two real round
 * trips — the extraction route, then the apply action — and `kind` is set by the
 * caller from which one is in flight. The rotating word comes from that phase's
 * bank (`lib/ai/status-words.ts`); rotating within a bank claims nothing new.
 *
 * ## The page
 *
 * A skeleton document with a scan line travelling down it. Everything here is
 * `transform` and `opacity` so it runs on the compositor, and the whole thing is
 * `aria-hidden` — `WorkingText` beside it owns the accessible announcement, and a
 * screen reader has nothing to gain from a description of a rectangle.
 *
 * **The line sweeps; the page does not fill in behind it.** An earlier version
 * revealed each text row as the line crossed it, which looked considerably better
 * and was a lie in exactly the way this file exists to avoid: it read as "we have
 * now understood these three lines", against a call that had returned nothing.
 * The page is a page, the line says work is happening, and neither pretends to
 * report on the other.
 */

/** The skeleton's rows: `[width %, is a heading]`. Hand-built rather than
 * generated so it reads as a resume at a glance — a title, a contact line, then
 * sections of decreasing regularity. */
const ROWS: readonly [number, boolean][] = [
  [52, true],
  [78, false],
  [0, false],
  [34, true],
  [96, false],
  [88, false],
  [72, false],
  [0, false],
  [40, true],
  [92, false],
  [64, false],
  [0, false],
  [30, true],
  [84, false],
];

/** One full travel of the scan line. Slow enough to read as deliberate
 * inspection rather than a loading spinner in disguise; fast enough that the eye
 * sees it move without waiting. */
const SWEEP_SECONDS = 2.8;

export function ResumeScan({
  kind,
  fileName,
  className,
}: {
  /** Which phase is genuinely running. Swaps the status bank. */
  kind: Extract<WorkKind, "scanning" | "building">;
  /** The file the user chose, so the screen is visibly about *their* document.
   * Truncated by CSS rather than by hand — a name is not a place to guess at a
   * character budget. */
  fileName?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("flex w-full flex-col items-center gap-6", className)}>
      <div
        className="relative h-64 w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-none"
        aria-hidden
      >
        {/* The page's content. Static, deliberately (see the header). */}
        <div className="flex h-full flex-col gap-2.5 px-5 py-6">
          {ROWS.map(([width, heading], index) =>
            width === 0 ? (
              // A section gap. Rendered as an element rather than as margin so
              // the rhythm of the page is described in one place, the table.
              <div key={index} className="h-2 shrink-0" />
            ) : (
              <div
                key={index}
                className={cn(
                  "shrink-0 rounded-full",
                  heading ? "h-2 bg-muted/60" : "h-1.5 bg-muted/25",
                )}
                style={{ width: `${width}%` }}
              />
            ),
          )}
        </div>

        {/*
          The scan line: a soft brand gradient with a hairline core, sweeping the
          full height. `-30%` to `130%` rather than `0` to `100%` so it enters and
          leaves off-page — a line that materialises at the top edge and vanishes
          at the bottom reads as a glitch rather than as a pass over the document.

          Reduced motion drops the travel and keeps a still band at the middle:
          doc 08's rule is gentler, not none, and the band is what keeps the page
          from looking like a component that failed to load.
        */}
        {reduce ? (
          <div className="absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 bg-linear-to-b from-transparent via-brand/12 to-transparent" />
        ) : (
          <motion.div
            className="absolute inset-x-0 h-16"
            initial={{ top: "-30%" }}
            animate={{ top: "130%" }}
            transition={{
              duration: SWEEP_SECONDS,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
              // A beat at each end. Without it the line reappears at the top the
              // instant it leaves the bottom, which reads as several lines rather
              // than one going round.
              repeatDelay: 0.35,
            }}
          >
            <div className="h-full bg-linear-to-b from-transparent via-brand/14 to-transparent" />
            <div className="h-px w-full bg-brand/70" />
          </motion.div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2.5">
          <MatrixSpinner rows={4} cols={4} size={4} gap={1.5} />
          <WorkingText kind={kind} className="text-sm text-muted" />
        </div>
        {fileName ? (
          <motion.p
            // Fades in rather than appearing, because it arrives one frame after
            // the file is chosen and a name that pops in reads as a layout jump.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="max-w-56 truncate font-mono text-xs text-muted/70"
            title={fileName}
          >
            {fileName}
          </motion.p>
        ) : null}
      </div>
    </div>
  );
}

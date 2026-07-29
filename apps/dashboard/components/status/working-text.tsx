"use client";

import { cn } from "@resfolio/ui";
import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import {
  STATUS_WORD_INTERVAL_MS,
  statusAnnouncement,
  statusWordAt,
  type WorkKind,
} from "@/lib/ai/status-words";

/**
 * The status line beside a working indicator: one short word from the current
 * phase's bank, swapped every couple of seconds.
 *
 * Pairs with `MatrixSpinner`; the two together are the app's whole "something
 * is happening" vocabulary. The words and the rule that governs them live in
 * `lib/ai/status-words.ts` — read that first, because the interesting decision
 * (a rotation may never imply a stage the server has not reported) is there.
 *
 * Three things here are not incidental:
 *
 * - **It shimmers, like every other working line** (`@resfolio/design`). The
 *   class derives its highlight from `currentColor`, so this is correct on muted
 *   copy and in both themes with nothing passed.
 * - **The cycling word is `aria-hidden`, and the announcement is separate.** A
 *   live status region whose text changes every 2.4s would be re-read by a
 *   screen reader every 2.4s, for as long as the model takes — the rotation is a
 *   *visual* answer to a line that looked stuck, and it has nothing to say to
 *   someone who is not looking at it. They get the bank's first word once, in a
 *   `sr-only` span, which is exactly what the line used to be.
 * - **Reduced motion pins the first word.** Doc 08's rule is "gentler, not
 *   none", and for text that is the whole of it: the shimmer keeps its own
 *   reduced-motion branch in CSS, and swapping words is movement with no
 *   gentler version.
 */
export function WorkingText({
  kind,
  detail,
  className,
}: {
  /** Which work is actually running. Changing this swaps the bank and restarts
   * the rotation at its truest word. */
  kind: WorkKind;
  /** One short clause of real detail from the server — "14 entries in view".
   * Absent rather than invented; it keeps its own muted colour. */
  detail?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce) return;

    // Reset here rather than in an effect of its own: a phase change is a new
    // bank, and it should open on the word that names it. The frame between the
    // change and this effect shows some *other* word of the new bank, which is
    // harmless — every word in a bank describes the same work, which is the
    // property the bank is built on.
    setTick(0);

    const id = window.setInterval(
      () => setTick((current) => current + 1),
      STATUS_WORD_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [kind, reduce]);

  return (
    <span className={cn("shimmer", className)}>
      <span aria-hidden>{statusWordAt(kind, tick)}…</span>
      <span className="sr-only">{statusAnnouncement(kind)}</span>
      {detail ? <span className="text-muted"> {detail}</span> : null}
    </span>
  );
}

"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea that grows with its content, upward, to a ceiling — then scrolls
 * inside itself.
 *
 * **Why this exists rather than `rows={2}` or `field-sizing: content`.** A fixed
 * `rows` is the bug it replaces: two lines of room, so a longer instruction
 * scrolls inside a box too small to read it back in. CSS `field-sizing: content`
 * does exactly this natively and is the right answer eventually, but it has no
 * Safari support at the time of writing and a composer that silently stops growing
 * on one browser is worse than a few lines of measurement.
 *
 * Three details that are the whole difference between this working and
 * *nearly* working:
 *
 * - **The height is reset to `auto` before every measurement.** `scrollHeight` is
 *   content height *or* the current height, whichever is larger — so measuring
 *   without resetting means the box can only ever grow. Deleting a paragraph would
 *   leave the composer tall and empty.
 * - **It runs in a layout effect, not an input handler.** The value can change
 *   without a keystroke — a suggestion chip filling the box, a send clearing it —
 *   and an `onChange`-only resize leaves the height stale in exactly those cases.
 * - **Overflow is toggled with the ceiling.** Left permanently on, the scrollbar
 *   gutter is reserved at one line and the text sits oddly; left permanently off,
 *   content past the ceiling is unreachable.
 *
 * The caller owns the value; this owns the height and nothing else.
 */
export function useAutosize(value: string, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    const next = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${next}px`;
    element.style.overflowY =
      element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  return ref;
}

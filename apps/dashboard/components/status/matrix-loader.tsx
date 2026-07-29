"use client";

import { cn } from "@resfolio/ui";
import { useMemo } from "react";

import { Matrix, createLoader } from "./matrix";

interface MatrixSpinnerProps {
  /** The grid, in dots. Square by convention; both are here so the frames can
   * be built for whatever is passed. */
  rows?: number;
  cols?: number;
  /** Dot pitch. The dot radius is `(size / 2) * 0.9`, so this is what decides
   * whether the dots read as dots or as specks. */
  size?: number;
  gap?: number;
  fps?: number;
  className?: string;
}

/**
 * The grid on its own — no label, no row, nothing but the animation.
 *
 * **This is what the AI chat uses.** `MatrixLoader` below owns a flex row and a
 * status line, which is right for a standalone indicator and wrong inside a
 * `Marker`, where the row and the text already exist and nesting a second set
 * produces two flex containers and two labels for one thing.
 *
 * The defaults are sized for a line of body text: a 4×4 grid at `size={4}` is a
 * 20.5px box with 3.6px dots, which sits on a 20px line box instead of towering
 * over it. 30 frames at 10fps — a three-second cycle.
 *
 * **Decorative by default** (`aria-hidden`). Every use site sits beside text
 * that already says what is happening, and `Matrix` sets `role="img"` with an
 * `aria-live` region — so left announced, a screen reader would read the status
 * twice and then keep re-reading it as frames advance.
 *
 * ## Why it looked flat, and what actually fixed it (2026-07-29)
 *
 * The obvious reading was "the colour isn't bright enough" — it was set to
 * `brand-3`, the softest peach in the palette, which is genuinely too quiet
 * against a dark surface. But raising the colour alone does not fix it, because
 * the thing missing was never a *value*: a real light source has a white-hot
 * centre and carries its hue only in the falloff, so a dot filled flat in one
 * accent reads as a slightly larger dot no matter which accent you pick.
 *
 * Four changes together, and the first two are the ones that count:
 *
 * - **`brand-soft` with a white-hot head.** `--matrix-head` lights the core of
 *   the leading dot; the gradient carries the brand colour outward from it.
 * - **A two-radius bloom** merged *under* the untouched dot, so the halo throws
 *   past the edge while the core stays sharp (`matrix.tsx`'s glow filter).
 * - **A longer tail** — six cells, not four — because the eye reads direction
 *   from the length of the fade, and a floor under the dim end so the last cells
 *   are visible rather than technically present.
 * - **A bigger head scale**, 1.35, so the leading dot reads as nearer than the
 *   grid it is travelling through.
 */
export function MatrixSpinner({
  rows = 4,
  cols = 4,
  size = 4,
  gap = 1.5,
  fps = 10,
  className,
}: MatrixSpinnerProps) {
  // The memo is load-bearing, not tidiness: `Matrix` resets its frame index
  // whenever the `frames` identity changes, so a fresh array on every render
  // would pin the animation to frame 0 forever.
  const frames = useMemo(() => createLoader(rows, cols), [rows, cols]);

  return (
    <Matrix
      rows={rows}
      cols={cols}
      frames={frames}
      fps={fps}
      autoplay
      loop
      size={size}
      gap={gap}
      // The unlit grid is meant to be sensed, not read — but at 0.08 it was
      // barely there, which left the travelling dot floating in the dark instead
      // of moving through a display.
      offOpacity={0.12}
      palette={{
        on: "currentColor",
        off: "var(--color-muted)",
        // Not a hard-coded white: `--color-surface` is the page's own lightest
        // value in both themes, so the core reads as hot against the brand
        // without inverting in light mode the way `#fff` would.
        head: "var(--color-surface)",
      }}
      // `brand-soft`, not `brand-3`. The soft peach was chosen when this was a
      // quiet background element; beside a streaming answer it is the one thing
      // on screen claiming work is happening, and it has to look like it.
      className={cn("shrink-0 text-brand-soft", className)}
      aria-hidden
    />
  );
}

interface MatrixLoaderProps {
  /** The status line beside the grid. */
  label?: string;
  rows?: number;
  cols?: number;
}

/**
 * The standalone thinking indicator: a dot matrix with one lit dot snaking
 * through it, beside a status line.
 *
 * The unlit grid is meant to be *sensed*, not read — it is what makes the lit
 * dot look like it is travelling through a display rather than floating in the
 * dark. `offOpacity` is the knob.
 */
export function MatrixLoader({
  label = "Mulling it over…",
  rows = 6,
  cols = 6,
}: MatrixLoaderProps) {
  return (
    <div className="flex items-center gap-2.5">
      <MatrixSpinner rows={rows} cols={cols} size={5} gap={2} fps={15} />
      {/* The label shimmers for the same reason the grid animates: this is the
          only thing on screen claiming work is happening, and a static line
          beside a moving grid reads as the label having got stuck. */}
      <span className="shimmer text-sm text-muted">{label}</span>
    </div>
  );
}

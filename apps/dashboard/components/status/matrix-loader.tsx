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
      offOpacity={0.08}
      palette={{ on: "currentColor", off: "var(--color-muted)" }}
      className={cn("shrink-0 text-brand-3", className)}
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
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

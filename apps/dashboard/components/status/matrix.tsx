"use client";

import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@resfolio/ui";

/**
 * A dot-matrix display: a grid of pixels driven by a list of frames.
 *
 * **Lives in `components/` rather than under a route.** It was originally in
 * `app/(dashboard)/loader/` beside a preview page, which meant a route folder
 * exporting a component to the rest of the app — and made the whole thing look
 * deletable once the preview route stopped being interesting, even though the AI
 * chat depends on it.
 */

export type Frame = number[][];
type MatrixMode = "default" | "vu";

interface CellPosition {
  x: number;
  y: number;
}

interface MatrixProps extends React.HTMLAttributes<HTMLDivElement> {
  rows: number;
  cols: number;
  pattern?: Frame;
  frames?: Frame[];
  fps?: number;
  autoplay?: boolean;
  loop?: boolean;
  size?: number;
  gap?: number;
  palette?: {
    on: string;
    off: string;
    /** The core of the leading dot. Defaults to `on`, so a caller that does not
     * think about it gets a flat dot rather than an unexpected white centre. */
    head?: string;
  };
  brightness?: number;
  /** How visible the unlit grid is behind the animation. */
  offOpacity?: number;
  ariaLabel?: string;
  onFrame?: (index: number) => void;
  mode?: MatrixMode;
  levels?: number[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ensureFrameSize(frame: Frame, rows: number, cols: number): Frame {
  const result: Frame = [];
  for (let r = 0; r < rows; r++) {
    const row = frame[r] || [];
    result.push([]);
    for (let c = 0; c < cols; c++) {
      result[r]![c] = row[c] ?? 0;
    }
  }
  return result;
}

function useAnimation(
  frames: Frame[] | undefined,
  options: {
    fps: number;
    autoplay: boolean;
    loop: boolean;
    onFrame?: (index: number) => void;
  },
): { frameIndex: number; isPlaying: boolean } {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(options.autoplay);
  const frameIdRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);

  useEffect(() => {
    if (!frames || frames.length === 0 || !isPlaying) {
      return;
    }

    const frameInterval = 1000 / options.fps;

    const animate = (currentTime: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = currentTime;
      }

      /**
       * **The accumulator may never bank more than one frame of time.**
       *
       * `requestAnimationFrame` does not run in a background tab, and it stalls
       * under devtools or any long task. When it resumes, `deltaTime` is the
       * length of the entire pause — seconds, not milliseconds — and all of it
       * went into the accumulator. But only **one** frame is advanced per rAF
       * tick while only **one** interval is subtracted, so the animation then
       * ran at the display's 60Hz instead of `fps` for as long as it took to
       * drain: switch away for ten seconds, come back, and the loader sprints
       * for six. The longer the pause the longer the sprint, which is why it
       * looked like a glitch that appeared "after a bit" rather than a wrong
       * frame rate.
       *
       * Dropping the missed time is right for a looping indicator: nobody is
       * owed the frames that elapsed while the tab was hidden, and a loader is
       * not synchronised to anything it could fall behind.
       */
      const deltaTime = Math.min(
        currentTime - lastTimeRef.current,
        frameInterval,
      );
      lastTimeRef.current = currentTime;
      accumulatorRef.current += deltaTime;

      if (accumulatorRef.current >= frameInterval) {
        accumulatorRef.current -= frameInterval;

        setFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            if (options.loop) {
              options.onFrame?.(0);
              return 0;
            } else {
              setIsPlaying(false);
              return prev;
            }
          }
          options.onFrame?.(next);
          return next;
        });
      }

      frameIdRef.current = requestAnimationFrame(animate);
    };

    frameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      // Reset, or the *next* subscription measures its first delta against a
      // timestamp from before the gap — the same banked-time sprint, arriving
      // through a re-render instead of a hidden tab.
      lastTimeRef.current = 0;
    };
  }, [frames, isPlaying, options.fps, options.loop, options.onFrame]);

  useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(options.autoplay);
    lastTimeRef.current = 0;
    accumulatorRef.current = 0;
  }, [frames, options.autoplay]);

  return { frameIndex, isPlaying };
}

function emptyFrame(rows: number, cols: number): Frame {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function setPixel(frame: Frame, row: number, col: number, value: number): void {
  if (row >= 0 && row < frame.length && col >= 0 && col < frame[0]!.length) {
    frame[row]![col] = value;
  }
}

/**
 * Head, then the comet tail behind it.
 *
 * The head is the only value above the render's `isActive` threshold (0.5), so
 * exactly one dot per frame gets the white-hot core, the bloom and the scale —
 * which is what makes it read as *the* dot rather than as the brightest of
 * several. The drop to 0.46 is deliberately steep; a gentle ramp is what makes a
 * trail look like a uniform ring instead of something travelling.
 *
 * **Six cells rather than four**, and the extra two are what turned a lit dot
 * into a light *moving*: the eye reads direction from the length of the fade, so
 * a short tail is a dot that teleports and a long one is a dot with momentum.
 * They are dim enough (0.10, 0.05) to be sensed rather than counted.
 */
const LOADER_TRAIL = [1, 0.46, 0.28, 0.18, 0.1, 0.05];

/** Every cell of the grid, spiralling clockwise from the top-left inward. */
function spiralPath(rows: number, cols: number): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;

  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col++) path.push([top, col]);
    top++;

    for (let row = top; row <= bottom; row++) path.push([row, right]);
    right--;

    if (top <= bottom) {
      for (let col = right; col >= left; col--) path.push([bottom, col]);
      bottom--;
    }

    if (left <= right) {
      for (let row = bottom; row >= top; row--) path.push([row, left]);
      left++;
    }
  }

  return path;
}

/**
 * One bright dot snaking through the whole grid, with a short fading trail.
 *
 * **Built for the grid it will be drawn on**, because `ensureFrameSize` *crops*
 * a frame larger than the display — a hardcoded 7×7 rendered at 5×5 cut away the
 * right column and bottom row and left the dot travelling an **L**. Generating
 * frames from the size they are shown at makes that unrepresentable.
 *
 * **The path spirals rather than hugging the perimeter**, so the dot covers the
 * whole display instead of orbiting an empty middle. It is a spiral inward
 * followed by the same spiral back out, which is what makes it loop: a spiral
 * that only runs inward has to teleport from the centre to the corner to repeat.
 * Reversing costs nothing and the turn reads as the snake doubling back.
 *
 * Cells, not a circle: `Math.round`-ing a circle onto a small grid lands two
 * steps on one cell and the dot stutters. Walking cell to cell is one step per
 * frame, always.
 */
export function createLoader(rows: number, cols: number): Frame[] {
  const inward = spiralPath(rows, cols);

  // Endpoints are trimmed from the return leg so the dot never takes two frames
  // on one cell at either end of the turn.
  const path = [...inward, ...inward.slice(1, -1).reverse()];

  return path.map((_, frame) => {
    const f = emptyFrame(rows, cols);

    // **Dimmest first, so the head is written last and always wins.** Where the
    // snake doubles back, a trail cell and the head land on the same square; in
    // head-first order the dimmer value overwrote the bright one and the dot
    // visibly dropped out at every turn.
    for (let i = LOADER_TRAIL.length - 1; i >= 0; i--) {
      const cell = path[(frame - i + path.length) % path.length];
      if (cell) {
        setPixel(f, cell[0], cell[1], LOADER_TRAIL[i] ?? 0);
      }
    }

    return f;
  });
}

/** The default 7×7 loader. Prefer `createLoader(rows, cols)` — a frame set and
 * the grid it is drawn on must be the same size (see above). */
export const loader: Frame[] = createLoader(7, 7);

export const Matrix = React.forwardRef<HTMLDivElement, MatrixProps>(
  (
    {
      rows,
      cols,
      pattern,
      frames,
      fps = 12,
      autoplay = true,
      loop = true,
      size = 10,
      gap = 2,
      palette = {
        on: "currentColor",
        off: "var(--color-muted)",
      },
      brightness = 1,
      offOpacity = 0.18,
      ariaLabel,
      onFrame,
      mode = "default",
      levels,
      className,
      ...props
    },
    ref,
  ) => {
    const { frameIndex } = useAnimation(frames, {
      fps,
      autoplay: autoplay && !pattern,
      loop,
      onFrame,
    });

    const currentFrame = useMemo(() => {
      if (mode === "vu" && levels && levels.length > 0) {
        return ensureFrameSize(vu(cols, levels), rows, cols);
      }

      if (pattern) {
        return ensureFrameSize(pattern, rows, cols);
      }

      if (frames && frames.length > 0) {
        return ensureFrameSize(
          frames[frameIndex] || (frames[0] as Frame),
          rows,
          cols,
        );
      }

      return ensureFrameSize([], rows, cols);
    }, [pattern, frames, frameIndex, rows, cols, mode, levels]);

    const cellPositions = useMemo(() => {
      const positions: CellPosition[][] = [];

      for (let row = 0; row < rows; row++) {
        positions[row] = [];
        for (let col = 0; col < cols; col++) {
          positions[row]![col] = {
            x: col * (size + gap),
            y: row * (size + gap),
          };
        }
      }

      return positions;
    }, [rows, cols, size, gap]);

    const svgDimensions = useMemo(() => {
      return {
        width: cols * (size + gap) - gap,
        height: rows * (size + gap) - gap,
      };
    }, [rows, cols, size, gap]);

    const isAnimating = !pattern && frames && frames.length > 0;

    // SVG ids are document-global: two <Matrix> on one page and every
    // `url(#…)` resolves to whichever <defs> came first, so the second
    // instance silently renders with the first one's palette.
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const onId = `matrix-on-${uid}`;
    const offId = `matrix-off-${uid}`;
    const headId = `matrix-head-${uid}`;
    const glowId = `matrix-glow-${uid}`;

    // The blur has to scale with the dot. A fixed stdDeviation of 2 against a
    // size={4} pixel (r = 1.8) blurs wider than the thing it is lighting.
    //
    // **Two radii, and the pair is what makes it look lit rather than blurred.**
    // A single Gaussian spreads the dot's own light and leaves it softer than it
    // started; a tight blur merged *under* the untouched source keeps the core
    // crisp while a wide one throws a halo past the dot's edge. That is the
    // difference between a smudge and a bulb.
    const glowRadius = Math.max(0.4, size * 0.22);
    const bloomRadius = Math.max(0.9, size * 0.55);

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel ?? "matrix display"}
        aria-live={isAnimating ? "polite" : undefined}
        className={cn("relative inline-block", className)}
        style={
          {
            "--matrix-on": palette.on,
            "--matrix-off": palette.off,
            "--matrix-head": palette.head ?? palette.on,
            "--matrix-gap": `${gap}px`,
            "--matrix-size": `${size}px`,
          } as React.CSSProperties
        }
        {...props}
      >
        <svg
          width={svgDimensions.width}
          height={svgDimensions.height}
          viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
          xmlns="http://www.w3.org/2000/svg"
          // `size-auto` looks like a no-op and is not. Icon containers in this
          // codebase auto-size bare SVGs — `Marker` carries
          // `[&_svg:not([class*='size-'])]:size-4` — so dropped into one of
          // those, this grid would silently render at 16px regardless of `size`
          // and `gap`. That selector's `:not()` is the opt-out it provides for
          // exactly this, and it keys on the *class* containing "size-", so the
          // class has to be here rather than on the wrapper. `auto` resolves to
          // the width/height attributes above, so nothing changes elsewhere.
          className="block size-auto"
          style={{ overflow: "visible" }}
        >
          <defs>
            <radialGradient id={onId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--matrix-on)" stopOpacity="1" />
              <stop
                offset="70%"
                stopColor="var(--matrix-on)"
                stopOpacity="0.85"
              />
              <stop
                offset="100%"
                stopColor="var(--matrix-on)"
                stopOpacity="0.6"
              />
            </radialGradient>

            <radialGradient id={offId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--matrix-off)" stopOpacity="1" />
              <stop
                offset="100%"
                stopColor="var(--matrix-off)"
                stopOpacity="0.7"
              />
            </radialGradient>

            {/**
             * The head, lit like a filament rather than filled like a dot.
             *
             * **A white-hot core inside the accent colour**, which is how an
             * actual light source photographs: the centre of anything bright
             * enough to glow reads as white and only its falloff carries the
             * hue. Painting the head flat in the brand colour is what made the
             * old loader look like a slightly-larger dot instead of a light —
             * no amount of raising the colour's brightness fixes that, because
             * the missing thing is the *gradient*, not the value.
             *
             * `--matrix-head` defaults to the on-colour, so a caller that does
             * not set it gets the previous behaviour rather than a surprise.
             */}
            <radialGradient id={headId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--matrix-head)" stopOpacity="1" />
              <stop
                offset="45%"
                stopColor="var(--matrix-on)"
                stopOpacity="1"
              />
              <stop
                offset="100%"
                stopColor="var(--matrix-on)"
                stopOpacity="0.75"
              />
            </radialGradient>

            {/**
             * Bloom, then glow, then the untouched source on top.
             *
             * Order is the whole filter: `feMerge` paints back to front, so the
             * wide halo goes down first, the tight one over it, and
             * `SourceGraphic` last — which is what keeps the dot's own edge
             * sharp. Merging in the other order buries the dot under its own
             * light and the result is a smudge that reads as being out of focus.
             */}
            <filter id={glowId} x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation={bloomRadius} result="bloom" />
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glowRadius}
                result="glow"
              />
              <feMerge>
                <feMergeNode in="bloom" />
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <style>
            {`
              /* **Shorter than one frame, and that is the whole point.** This
                 was 300ms, against a frame interval of 83–100ms at the 10–12fps
                 these animations run at — so every dot was still fading through
                 the *next three frames*, three frames were on screen at once,
                 and the result was a blur that barely moved. A transition here
                 may only soften the step between two frames; it may never
                 outlive one. */
              .matrix-pixel {
                transition: opacity 50ms linear, transform 50ms linear;
                transform-origin: center;
                transform-box: fill-box;
              }

              @media (prefers-reduced-motion: reduce) {
                .matrix-pixel {
                  transition: none;
                }
              }
            `}
          </style>

          {currentFrame.map((row, rowIndex) =>
            row.map((value, colIndex) => {
              const pos = cellPositions[rowIndex]?.[colIndex];
              if (!pos) return null;

              const opacity = clamp(brightness * value);
              const isActive = opacity > 0.5;
              const isOn = opacity > 0.04;

              // The head swells noticeably. 1.1 was a change you had to be told
              // about; at 1.35 the leading dot reads as nearer than the grid,
              // which is most of what sells the movement.
              const scale = isActive ? 1.35 : 1;
              const radius = (size / 2) * 0.9;

              return (
                <circle
                  key={`${rowIndex}-${colIndex}`}
                  className="matrix-pixel"
                  cx={pos.x + size / 2}
                  cy={pos.y + size / 2}
                  r={radius}
                  fill={
                    isActive
                      ? `url(#${headId})`
                      : isOn
                        ? `url(#${onId})`
                        : `url(#${offId})`
                  }
                  // **The trail is floored well above its raw value.** The tail
                  // exists to show where the light has been, and at its literal
                  // 0.05 the last two cells were indistinguishable from the unlit
                  // grid — so the animation lost exactly the part that makes it
                  // read as travelling. The curve is compressed rather than
                  // rescaled, keeping the head unambiguously brightest.
                  opacity={isOn ? 0.22 + opacity * 0.78 : offOpacity}
                  filter={isActive ? `url(#${glowId})` : undefined}
                  style={{
                    transform: `scale(${scale})`,
                  }}
                />
              );
            }),
          )}
        </svg>
      </div>
    );
  },
);

Matrix.displayName = "Matrix";

/** Column levels as a bar-graph frame — the `mode="vu"` display. */
export function vu(columns: number, levels: number[]): Frame {
  const rows = 7;
  const frame = emptyFrame(rows, columns);

  for (let col = 0; col < Math.min(columns, levels.length); col++) {
    const level = Math.max(0, Math.min(1, levels[col] ?? 0));
    const height = Math.floor(level * rows);

    for (let row = 0; row < rows; row++) {
      const rowFromBottom = rows - 1 - row;
      if (rowFromBottom < height) {
        let brightness = 1;
        if (row < rows * 0.3) {
          brightness = 1;
        } else if (row < rows * 0.6) {
          brightness = 0.8;
        } else {
          brightness = 0.6;
        }
        frame[row]![col] = brightness;
      }
    }
  }

  return frame;
}

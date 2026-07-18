import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Input` — structure and behaviour from upstream, Resfolio's
 * shape (`rounded-xl`, `h-10`) and tokens.
 *
 * Adopted from upstream: `data-slot`; the `file:` styles (without them a file
 * input renders its button at the browser default and ignores every other rule
 * here); `selection:` colours; `min-w-0`, so the input can actually shrink
 * inside a flex row instead of forcing overflow; and `text-base md:text-sm` —
 * the 16px base is what stops iOS Safari zooming the viewport on focus.
 *
 * Kept ours: `aria-invalid` is the **single source of truth** for the error
 * state, because it is what assistive tech reads — styling off anything else
 * lets the visual and the screen reader disagree. Ordered after the
 * hover/focus rules so an invalid field stays red under both.
 */
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border border-border bg-surface px-3.5 py-1 text-base text-foreground outline-none transition-colors duration-(--duration-fast) ease-out md:text-sm",
        "placeholder:text-muted/70 selection:bg-brand selection:text-white",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "hover:border-brand/30",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

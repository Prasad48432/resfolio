import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Textarea`, on Resfolio's shape and tokens. Mirrors `Input`
 * exactly — same border, focus, disabled and `aria-invalid` treatment — so the
 * two never drift apart within a form. See `Input` for why `aria-invalid` is
 * the single source of truth for the error state.
 *
 * `field-sizing-content` is upstream's: the box grows with what is typed
 * rather than sitting at a fixed height with an inner scrollbar. `rows` still
 * sets the starting height where a call site passes one.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base text-foreground outline-none transition-colors duration-(--duration-fast) ease-out md:text-sm",
        "placeholder:text-muted/70 selection:bg-brand selection:text-white",
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

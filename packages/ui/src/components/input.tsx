import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground transition-colors duration-(--duration-fast) ease-out placeholder:text-muted/70 hover:border-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
        // The error state. `aria-invalid` is the single source of truth — it is
        // what assistive tech reads, so styling off anything else would let the
        // two disagree. Ordered after the hover/focus rules so an invalid field
        // stays red under both (equal specificity: last one wins).
        "aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

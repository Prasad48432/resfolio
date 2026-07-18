import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-(--duration-fast) ease-out placeholder:text-muted/70 hover:border-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
        // See Input: `aria-invalid` is the single source of truth for the error
        // state, ordered last so it survives hover and focus.
        "aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

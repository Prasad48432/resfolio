import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * A toggle switch (shadcn/ui look) built on a native `<input type="checkbox">`
 * — form-associated and keyboard-toggleable, styled as a sliding track. Use for
 * a single on/off setting where the state reads as "enabled/disabled"; use
 * `Checkbox` for list-style selection.
 */
export function Switch({ className, ...props }: ComponentProps<"input">) {
  return (
    <label
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center",
        className,
      )}
    >
      <input type="checkbox" className="peer sr-only" {...props} />
      <span className="h-5 w-9 rounded-full bg-border transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
      <span className="pointer-events-none absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
    </label>
  );
}

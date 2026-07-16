import { Check } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * A styled checkbox (shadcn/ui look) built on a native `<input type="checkbox">`
 * so it stays form-associated and accessible. The box and its check are a
 * sibling pair driven by `peer-checked`. Wrap with a `<label>` for a clickable
 * caption.
 */
export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <input
        type="checkbox"
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded border border-border bg-surface transition-colors checked:border-accent checked:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
        aria-hidden
      />
    </span>
  );
}

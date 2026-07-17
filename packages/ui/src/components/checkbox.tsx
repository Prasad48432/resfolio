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
          // Focus is the platform halo from @resfolio/design, matching every
          // other control — not a bespoke ring.
          "peer size-4 cursor-pointer appearance-none rounded border border-border bg-surface transition-colors duration-(--duration-press) ease-out checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute size-3 scale-90 text-white opacity-0 transition-[opacity,transform] duration-(--duration-press) ease-out peer-checked:scale-100 peer-checked:opacity-100"
        aria-hidden
      />
    </span>
  );
}

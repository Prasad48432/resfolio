import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * A styled native `<select>` (shadcn/ui look, plain-element convention —
 * matching `Input`/`Textarea`). A native control is deliberate: it stays
 * form-associated, keyboard- and screen-reader-accessible for free, and avoids
 * the open/close state pitfalls of a custom portal dropdown. Pass `<option>`s
 * as children.
 */
export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-xl border border-border bg-surface pl-3.5 pr-9 text-sm text-foreground transition-colors hover:border-accent/30 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}

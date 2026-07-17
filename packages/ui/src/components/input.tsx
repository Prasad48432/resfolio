import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground transition-colors duration-(--duration-fast) ease-out placeholder:text-muted/70 hover:border-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

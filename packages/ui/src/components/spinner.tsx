import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * The platform's loading indicator — twelve fading bars, replacing lucide's
 * `Loader2` + `animate-spin` everywhere in the dashboard.
 *
 * Like `Button`, this carries no `"use client"`: the whole animation is CSS
 * (`.spinner` / `.spinner-bar` in @resfolio/design), so it renders inside
 * Server Components and never drags a page over the client boundary.
 *
 * **It has no colour prop, deliberately.** The bars are `currentColor`, so the
 * spinner inherits the text colour of wherever it sits — white inside a brand
 * `Button`, `text-muted` beside status copy, and correct in dark mode without
 * a `dark:` variant. To recolour it, colour its context (`text-brand`), which
 * is the same thing every icon in this codebase already does.
 *
 * Sizes mirror `Button`'s `[&_svg]:size-*` steps, because that is what it
 * replaces — but note `Button`'s icon sizing targets `svg` and this is a
 * `div`, so a spinner in a `sm` button needs `size="sm"` explicitly rather
 * than inheriting it.
 */
export const spinnerVariants = cva("spinner", {
  variants: {
    size: {
      sm: "size-3.5",
      md: "size-4",
      lg: "size-5",
      xl: "size-6",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface SpinnerProps
  extends ComponentProps<"div">, VariantProps<typeof spinnerVariants> {
  /**
   * Accessible name. Provide it when the spinner is the *only* indication that
   * something is loading (a bare page or panel), which promotes it to a live
   * `role="status"`.
   *
   * Omit it — the default — when adjacent text already says so ("Saving…",
   * "Publishing…") or when an enclosing element is already the live region.
   * A second announcement of the same fact is noise, not accessibility.
   */
  label?: string;
}

const BAR_COUNT = 12;

export function Spinner({ className, size, label, ...props }: SpinnerProps) {
  return (
    <div
      data-slot="spinner"
      className={cn(spinnerVariants({ size }), className)}
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} className="spinner-bar" />
      ))}
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Label`, on Radix's primitive.
 *
 * Radix is what makes this more than a styled `<label>`: it forwards the click
 * to the associated control and suppresses the browser's text selection on
 * double-click, which otherwise makes rapid toggling select the caption
 * instead of flipping the control.
 *
 * Resfolio keeps its own type ramp (`text-xs`, `text-muted`) — a form label in
 * this product is quiet supporting text, not the `text-sm` upstream ships.
 * That is the intended shape of divergence: upstream's structure and
 * behaviour, our tokens.
 */
function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs leading-none font-medium text-muted select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Checkbox`, on Radix's primitive.
 *
 * This replaced a hand-rolled `<input type="checkbox">` styled with
 * `peer-checked`. That version looked right and behaved almost right — but the
 * indeterminate state was unreachable, and the check mark was a sibling the
 * control itself didn't own. Radix ships the state machine and the ARIA; we
 * ship the palette.
 *
 * **The API changed with it**: `onCheckedChange(checked)` replaces the native
 * `onChange(event)`. Reading `event.target.checked` is a call-site error now,
 * not a styling difference.
 *
 * Resfolio's fill is `brand`, not shadcn's `primary` (which the bridge maps to
 * ink): a ticked box is one of the few places the product spends brand colour,
 * because it reports a user's own choice back to them.
 */
function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-border bg-surface outline-none transition-[color,background-color,border-color] duration-(--duration-press) ease-out",
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-white",
        "data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:text-white",
        // The platform focus halo from @resfolio/design — `outline`, not a
        // ring, so it follows this element's own radius like every other
        // control in the product.
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Switch`, on Radix's primitive.
 *
 * This replaced a `<label>` wrapping an `sr-only` checkbox with two sibling
 * spans. That construction had a real cost: because the focusable element was
 * invisible, the focus ring had to be re-drawn by a sibling via
 * `peer-focus-visible`, and the whole control announced itself as a checkbox
 * rather than a switch. Radix renders a real `role="switch"` button and owns
 * its own focus.
 *
 * **The API changed with it**: `onCheckedChange(checked)` replaces the native
 * `onChange(event)`.
 *
 * Use for a single on/off setting that reads as enabled/disabled; use
 * `Checkbox` for list-style selection.
 */
function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors duration-(--duration-fast) ease-out",
        "data-[state=checked]:bg-brand data-[state=unchecked]:bg-border",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-(--duration-fast) ease-out",
          "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

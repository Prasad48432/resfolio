"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * An anchored product overlay. Registry-derived, but restyled onto this app's
 * own surface + motion vocabulary (`animate-popover-in`, doc 08's 150–200ms
 * product budget) rather than the registry's `tailwindcss-animate` classes,
 * which this repo does not carry.
 */
export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-[0_12px_32px_rgba(38,32,25,0.12)]",
          "origin-(--radix-popover-content-transform-origin) focus:outline-none",
          "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

function DialogOverlay({
  animated = true,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay> & { animated?: boolean }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px]",
        animated &&
          "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = false,
  animated = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /**
   * Pass `false` for a dialog opened by keyboard shortcut. An animation on a
   * surface someone summons a hundred times a day reads as lag, not polish:
   * it delays the thing they already decided they wanted. The command palette
   * is the canonical case; a mouse-opened modal should stay animated.
   *
   * A real prop rather than a `className` override, because these animation
   * utilities are plain CSS classes that `cn` has no way to cancel.
   */
  animated?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay animated={animated} />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-surface p-0 shadow-[0_16px_48px_rgba(38,32,25,0.12)]",
          "focus:outline-none",
          animated &&
            "data-[state=open]:animate-modal-in data-[state=closed]:animate-modal-out",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            className="absolute top-4 right-4 cursor-pointer rounded-full p-1 text-muted transition-[transform,color] duration-(--duration-press) ease-out hover:text-foreground active:scale-[0.97]"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

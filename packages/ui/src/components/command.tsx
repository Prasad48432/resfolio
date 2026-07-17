"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[inherit] bg-surface text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Command palette in a dialog — the `cmd+k` surface
 * (docs/architecture/08-dashboard-ux.md). Callers own open state and
 * provide CommandInput/List children.
 *
 * Deliberately unanimated (`animated={false}`): this is a keyboard surface
 * opened dozens of times a session, and any enter transition puts a delay
 * between the shortcut and the input being ready to type into. It should
 * simply be there. Raycast ships no palette animation for the same reason.
 */
export function CommandDialog({
  open,
  onOpenChange,
  title = "Command palette",
  children,
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("overflow-hidden", className)}
        animated={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command {...props}>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4">
      <Search className="size-4 shrink-0 text-muted" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          "h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-80 overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

export function CommandEmpty(
  props: ComponentProps<typeof CommandPrimitive.Empty>,
) {
  return (
    <CommandPrimitive.Empty
      className="py-8 text-center text-sm text-muted"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-foreground select-none",
        "data-[selected=true]:bg-surface-warm data-[selected=true]:text-foreground",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto font-mono text-[11px] text-muted">{children}</kbd>
  );
}

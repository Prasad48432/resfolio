import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Button` — same structure, same variant vocabulary, Resfolio
 * tokens and shape.
 *
 * What is upstream: the cva shape, `asChild`, `data-slot`, the six variant
 * names, `size: default | sm | lg | icon`, the `[&_svg]` icon sizing with an
 * `:not([class*='size-'])` escape so a call site can override it,
 * `aria-invalid` styling, and `has-[>svg]` padding so an icon-plus-label
 * button isn't wider than it should be.
 *
 * What is deliberately ours:
 * - **`rounded-full`**, not upstream's `rounded-md`. The pill is Resfolio's
 *   button shape across marketing and product — identity, not drift.
 * - **`default` is `bg-brand`**, not the bridge's `primary` (which maps to
 *   ink). A dashboard's loud fill should be rare, but the *default* button in
 *   this product is the brand action.
 * - **`icon-sm`**, an addition. Registry components (Sheet's close, Sidebar's
 *   trigger) ask for it by name, so carrying it is cheaper than hand-editing
 *   every file the CLI adds, forever.
 * - **Press feedback is CSS** (`active:scale-[0.97]`), so this file needs no
 *   `"use client"` and renders inside Server Components in both apps. Wrapping
 *   it in `motion.button` would drag every page holding one over the client
 *   boundary to buy what a 140ms transform already delivers.
 *
 * `secondary`/`ghost`/`sm`/`lg`/`icon` already matched upstream's names, and
 * `primary`/`md` were the *defaults* — so adopting the upstream vocabulary
 * renamed nothing at any call site.
 */
export const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap outline-none",
    "transition-[transform,color,background-color,border-color] duration-(--duration-press) ease-out active:scale-[0.97]",
    // A disabled button never reaches `:active` — `pointer-events-none` stops
    // the press first — so the scale needs no further guard, and stays
    // un-gated so it also applies to `asChild` links, which are never
    // `:enabled`.
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "aria-invalid:outline-destructive",
  ),
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-soft",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:outline-destructive",
        outline:
          "border border-border bg-surface text-foreground hover:border-brand/40 hover:text-brand",
        secondary:
          "border border-border bg-surface text-foreground hover:border-brand/40 hover:text-brand",
        ghost: "text-muted hover:bg-surface-warm hover:text-foreground",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-3.5 text-xs has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-6 has-[>svg]:px-5",
        icon: "size-9",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next `<Link>`) with button styling. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

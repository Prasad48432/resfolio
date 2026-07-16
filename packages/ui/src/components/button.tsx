import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Press feedback (`active:scale-[0.97]`) is CSS, not Framer Motion, and
 * deliberately so: this component has no `"use client"` and is rendered
 * inside Server Components in both apps. Wrapping it in `motion.button`
 * would force every consumer — and every page that holds one — client-side
 * to buy an effect a 140ms transform already delivers.
 *
 * A disabled button never reaches `:active` because `disabled:pointer-events-none`
 * already stops the press, so the scale needs no further guard — and stays
 * un-gated so it also applies to `asChild` links, which are never `:enabled`.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[transform,color,background-color,border-color] duration-(--duration-press) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-soft",
        secondary:
          "border border-border bg-surface text-foreground hover:border-accent/40 hover:text-accent",
        ghost: "text-muted hover:bg-surface-warm hover:text-foreground",
      },
      size: {
        sm: "h-8 px-3.5 text-xs [&_svg]:size-3.5",
        md: "h-10 px-5 text-sm [&_svg]:size-4",
        lg: "h-11 px-6 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next <Link>) with button styling. */
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
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

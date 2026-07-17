import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * A surface container (shadcn/ui `Card` pattern) themed by design tokens.
 *
 * This — a hairline border and no shadow — is the product's surface. It is
 * not `card-surface` from @resfolio/design, which carries a 32px ambient glow
 * and an inset highlight built for the landing page. Doc 08 is explicit:
 * "hairline `border-border` separators over shadows". Reach for `Card` in the
 * dashboard; leave `card-surface` to marketing.
 */
export const cardVariants = cva(
  "rounded-2xl border border-border bg-surface text-foreground",
  {
    variants: {
      /**
       * `interactive` is for a card that is itself a link or button. Hover
       * warms the border rather than lifting the card, which keeps the row
       * flat and the list calm; the press scale matches `Button`.
       */
      interactive: {
        true: "cursor-pointer transition-[transform,border-color,background-color] duration-(--duration-press) ease-out hover:border-brand/40 active:scale-[0.995]",
        false: "",
      },
    },
    defaultVariants: { interactive: false },
  },
);

export function Card({
  className,
  interactive,
  asChild = false,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    /**
     * Render the child element (a Next `<Link>`, a `<button>`) with card
     * styling. An interactive card should almost always use this: it makes
     * the whole card the single real link or button, rather than a div with
     * a click handler wrapped around one.
     */
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp className={cn(cardVariants({ interactive }), className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-5 pb-0", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-3 p-5 pt-0", className)}
      {...props}
    />
  );
}

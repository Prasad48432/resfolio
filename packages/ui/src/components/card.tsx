import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * Upstream shadcn `Card`, on Resfolio's surface.
 *
 * **This is the product's surface** — a hairline border and no shadow. It is
 * not `card-surface` from @resfolio/design, which carries a 32px ambient glow
 * built for the landing page. Doc 08 is explicit: "hairline `border-border`
 * separators over shadows". Reach for `Card` in the dashboard; leave
 * `card-surface` to marketing. That is why upstream's `shadow-sm` is dropped
 * and `rounded-2xl` replaces `rounded-xl`.
 *
 * **One deliberate structural divergence: the root carries no padding.**
 * Upstream puts `py-6` on the root and `px-6` on each part. Thirteen live call
 * sites already pass their own padding to a bare root, so adopting that model
 * would silently double-pad every one of them. Instead each sub-component is
 * self-contained — it brings its own box — which keeps a bare `<Card>` free to
 * be styled by its caller while a composed one still spaces correctly. If the
 * app ever standardises on the sub-components, move the padding to the root
 * and drop it from the parts in the same change.
 *
 * `interactive` and `asChild` are Resfolio additions; everything else
 * (`data-slot`, the grid header, `CardAction`) is upstream.
 */
export const cardVariants = cva(
  "flex flex-col rounded-2xl border border-border bg-surface text-foreground",
  {
    variants: {
      /**
       * For a card that is itself a link or button. Hover warms the border
       * rather than lifting the card, which keeps the row flat and the list
       * calm; the press scale matches `Button`.
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
    <Comp
      data-slot="card"
      className={cn(cardVariants({ interactive }), className)}
      {...props}
    />
  );
}

/**
 * Upstream's grid header. The `has-data-[slot=card-action]` rule is what makes
 * `CardAction` work without a wrapper: the header becomes two columns only
 * when an action is actually present, so a header without one doesn't reserve
 * an empty gutter.
 */
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 pt-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-sm leading-none font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
}

/** A control pinned to the header's top-right — a menu trigger, a switch. */
export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-5", className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3 px-5 pb-5 [.border-t]:pt-5",
        className,
      )}
      {...props}
    />
  );
}

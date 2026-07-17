import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/**
 * From the shadcn registry, with one deliberate edit: `bg-muted` →
 * `bg-surface-warm`.
 *
 * This is the one place shadcn's colour vocabulary and ours genuinely disagree
 * and the token bridge can't reconcile it. shadcn spends `muted` on a *surface*
 * (a pale wash) and puts the text colour on `muted-foreground`; @resfolio/design
 * spends `--color-muted` on the secondary **text** colour (#6f6455) across 212
 * call sites. Tailwind generates `bg-muted` and `text-muted` from that one
 * token, so `bg-muted` here would paint a dark brown block.
 *
 * Renaming ours to `muted-foreground` would align the vocabularies completely —
 * but that is 212 edits to fix 1, and `text-muted` reads better in our own code.
 * `accent` earned its rename because it collided in *every* interactive
 * component; `muted` collides only where a registry component wants a muted
 * surface, which is rare. So: patch the rare case, keep the ergonomic name.
 *
 * **If you add a registry component that uses `bg-muted`** (Tabs' list, Avatar's
 * fallback), make the same swap — `bg-surface-warm` is what shadcn means by it.
 */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-warm", className)}
      {...props}
    />
  );
}

export { Skeleton };

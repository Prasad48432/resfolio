import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@resfolio/ui";

/**
 * The one empty state. The dashboard previously had three shapes for "nothing
 * here yet" — a centred card, a dashed box, and an icon-and-prose block — so
 * the same idea looked like three different products depending on the route.
 *
 * A dashed border (not a solid card) is deliberate: dashes read as a slot
 * waiting to be filled, where a solid surface reads as a thing that exists
 * and happens to be blank.
 *
 * `size` reflects what is empty. `page` is a whole route with nothing in it
 * and can afford an icon and an action; `inline` sits inside a populated form
 * where a section has no rows yet and must stay quiet enough not to compete
 * with the fields around it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "page",
  className,
  ...props
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "page" | "inline";
  className?: string;
} & Omit<React.ComponentProps<"div">, "title">) {
  const isPage = size === "page";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center",
        isPage ? "gap-3 px-6 py-14" : "gap-1 px-4 py-6",
        className,
      )}
      {...props}
    >
      {Icon && isPage ? (
        <Icon className="size-6 text-muted/70" aria-hidden />
      ) : null}
      <p
        className={cn(
          "text-foreground",
          isPage ? "text-sm font-medium" : "text-xs text-muted",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

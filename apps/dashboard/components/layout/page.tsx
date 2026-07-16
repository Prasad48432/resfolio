import type { ReactNode } from "react";

import { cn } from "@resfolio/ui";

/**
 * The standard page container: one measure, one rhythm, every route.
 *
 * Routes previously chose their own width, so navigating between them shifted
 * the content column sideways — the kind of thing nobody reports as a bug and
 * everybody feels as sloppiness.
 *
 * `wide` opts an editor route out of the reading measure: a split workspace
 * needs the full shell width for its preview pane, and constraining it to
 * prose width would defeat the point.
 */
export function Page({
  children,
  wide = false,
  className,
  ...props
}: {
  children: ReactNode;
  wide?: boolean;
} & React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6",
        wide ? "max-w-none" : "max-w-(--spacing-page)",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

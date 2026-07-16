import type { ReactNode } from "react";

/**
 * The page title block. Every route renders exactly one, and none hand-rolls
 * its own — five pages previously each built this by hand and disagreed about
 * measure (`max-w-2xl` vs `max-w-3xl`), gap (6 vs 8), and whether there was a
 * rule underneath. Composition is what keeps them from drifting again.
 *
 * The title is Manrope, not Instrument Serif. The serif is Resfolio's brand
 * voice and stays where a voice belongs — the marketing site and the sidebar
 * wordmark. A productivity screen the user reads for hours wants a tight sans
 * and earns its hierarchy from weight, size, and space instead.
 *
 * No `"use client"`: pages are Server Components and this must not drag them
 * over the boundary. Motion is applied by the caller wrapping content in
 * `<FadeIn>`, never in here.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  /** One line. If it needs two, it belongs in the page body. */
  description?: string;
  /** The page's primary action, right-aligned. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

import { Card } from "@resfolio/ui";

import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Placeholder for routes whose feature lands in a later phase
 * (docs/DEVELOPMENT-PLAN.md). The pages teach what's coming instead of
 * showing an empty void.
 *
 * Composed from `Page`/`PageHeader` like any real route: a placeholder that
 * lays itself out differently is how a product starts feeling like a set of
 * unrelated screens. The only thing provisional here is the content.
 */
export function ComingSoon({
  title,
  phase,
  description,
  bullets,
}: {
  title: string;
  phase: number;
  description: string;
  bullets: string[];
}) {
  return (
    <Page>
      <PageHeader title={title} description={description} />
      <Card className="flex flex-col gap-4 p-5">
        <p className="label-section">Planned for phase {phase}</p>
        <ul className="flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex items-start gap-3 text-[13px] leading-relaxed text-muted"
            >
              <span
                className="mt-[7px] size-1 shrink-0 rounded-full bg-muted/50"
                aria-hidden
              />
              {bullet}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

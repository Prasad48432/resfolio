/**
 * Placeholder for routes whose feature lands in a later phase
 * (docs/DEVELOPMENT-PLAN.md). Phase 2 ships the shell; the pages teach
 * what's coming instead of showing an empty void.
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="label-eyebrow">Phase {phase}</p>
        <h2 className="font-display text-3xl text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="card-surface p-6">
        <ul className="flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex items-start gap-3 text-sm text-muted"
            >
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden
              />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

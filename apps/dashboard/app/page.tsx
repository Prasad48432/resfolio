import { Button } from "@resfolio/ui";
import { ArrowRight } from "lucide-react";

export default function DashboardPlaceholder() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
      data-testid="dashboard-placeholder"
    >
      <p className="label-eyebrow">Resfolio</p>
      <h1 className="font-display text-4xl text-foreground">
        The dashboard is <em className="text-accent">on its way</em>
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">
        This is where the authenticated Resfolio experience will live — one
        profile powering your resume, portfolio, and personal site. The
        marketing site lives at{" "}
        <a
          href="https://resfolio.me"
          className="text-accent underline-offset-4 hover:underline"
        >
          resfolio.me
        </a>
        .
      </p>
      <div className="card-surface mt-2 flex items-center gap-3 px-5 py-4">
        <span className="size-2 rounded-full bg-live" aria-hidden />
        <span className="text-xs text-muted">
          Foundation phase — design system, tooling, and CI are in place.
        </span>
      </div>
      <Button asChild data-testid="dashboard-placeholder-cta">
        <a href="https://resfolio.me">
          Visit resfolio.me
          <ArrowRight aria-hidden />
        </a>
      </Button>
    </main>
  );
}

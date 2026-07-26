import GetStartedButton from "@/components/landing/get-started-button";
import { TEST_IDS } from "@/lib/testids";

export default function WaitlistCta() {
  return (
    <section
      id="get-started"
      data-testid={TEST_IDS.ctaSection}
      className="relative overflow-hidden border-t border-border py-28 md:py-40"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,rgba(240,89,43,0.10),transparent_65%)]"
      />

      <div className="relative mx-auto max-w-4xl px-6 text-center lg:px-8">
        <span className="label-eyebrow">Claim your name</span>
        <h2 className="mt-6 font-display text-5xl leading-[0.98] tracking-tight text-foreground md:text-7xl lg:text-8xl">
          Reserve <em className="italic text-brand">your handle</em>
          <br />
          before someone else does.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[15px] text-muted md:text-lg">
          Founding users lock in Pro at $8/mo forever.
        </p>

        <GetStartedButton className="mt-10" testId={TEST_IDS.ctaGetStarted} />

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] text-muted">
          <span>Founding pricing $8/mo forever</span>
        </div>
      </div>
    </section>
  );
}

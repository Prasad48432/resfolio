import { Sparkles } from "lucide-react";
import HeroGraphic from "@/components/landing/hero-graphic";
import GetStartedButton from "@/components/landing/get-started-button";
import { TEST_IDS } from "@/lib/testids";

/**
 * Server Component by design: the hero is the page's LCP content, so it
 * must not wait on client JS to paint or animate. Entrance motion comes
 * from the CSS `animate-fade-up`/`animate-fade-scale` keyframes in
 * globals.css; only the live graphic and the waitlist form are client
 * islands.
 */
export default function Hero() {
  return (
    <section
      id="top"
      data-testid={TEST_IDS.heroSection}
      className="relative overflow-hidden pb-20 pt-24 md:pb-28 md:pt-40"
    >
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-7">
          <div
            data-testid={TEST_IDS.heroEyebrow}
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-muted shadow-[0_1px_2px_rgba(38,32,25,0.04)]"
          >
            <Sparkles size={12} className="text-brand" aria-hidden />
            One profile · resume, portfolio &amp; public API
          </div>

          <h1
            data-testid={TEST_IDS.heroHeading}
            style={{ animationDelay: "50ms" }}
            className="animate-fade-up mt-6 font-display text-[52px] leading-[0.98] tracking-tight text-foreground sm:text-6xl lg:text-[88px]"
          >
            Your career,
            <br />
            <span className="bg-linear-to-r from-brand-2 via-brand to-brand-3 bg-clip-text italic text-transparent">
              one profile.
            </span>
          </h1>

          <p
            data-testid={TEST_IDS.heroSubhead}
            style={{ animationDelay: "150ms" }}
            className="animate-fade-up mt-6 max-w-xl text-[15px] leading-relaxed text-muted md:text-lg"
          >
            One profile you own and maintain. Resfolio publishes it as a
            polished resume, a live portfolio site, and a public API —{" "}
            <em className="not-italic font-medium text-foreground">
              all generated from the same source
            </em>
            , and all up to date by default.
          </p>

          <GetStartedButton
            className="animate-fade-up mt-8"
            style={{ animationDelay: "250ms" }}
            testId={TEST_IDS.heroCta}
          />

          <p
            data-testid={TEST_IDS.heroMicrocopy}
            style={{ animationDelay: "300ms" }}
            className="animate-fade-up mt-4 text-[12px] text-muted"
          >
            Reserve{" "}
            <span className="font-mono text-foreground/70">
              resfolio.me/your-name
            </span>{" "}
            — free during beta.
          </p>
        </div>

        <div
          data-testid={TEST_IDS.heroVisual}
          style={{ animationDelay: "100ms" }}
          className="animate-fade-scale relative mx-auto w-full max-w-[520px] lg:col-span-5"
        >
          <HeroGraphic />
        </div>
      </div>
    </section>
  );
}

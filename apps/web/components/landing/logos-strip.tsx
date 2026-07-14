import { TEST_IDS } from "@/lib/testids";

// Well-known places our audience — designers, PMs, marketers, founders,
// engineers — actually work. Framed around professionals, not dev tooling.
const marks = [
  "Google",
  "Airbnb",
  "Spotify",
  "Stripe",
  "Figma",
  "Notion",
  "IDEO",
  "Netflix",
];

/**
 * Pure CSS marquee (the `marquee-track` keyframes in globals.css) — no JS
 * needed, so this stays a Server Component.
 */
export default function LogosStrip() {
  return (
    <section
      data-testid={TEST_IDS.logosStrip}
      className="relative overflow-hidden border-y border-border bg-surface/60 py-8"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 lg:px-8">
        <p className="label-eyebrow shrink-0 hidden text-muted md:block">
          Loved by professionals from
        </p>
        <div className="mask-fade relative flex-1 overflow-hidden">
          <div className="marquee-track flex w-max items-center gap-14 whitespace-nowrap">
            {[...marks, ...marks].map((m, i) => (
              <span
                key={`${m}-${i}`}
                aria-hidden={i >= marks.length}
                className="font-display text-2xl text-foreground/35 transition-colors hover:text-foreground md:text-3xl"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

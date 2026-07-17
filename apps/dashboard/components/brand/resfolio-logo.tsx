import ResfolioMark from "@/components/brand/resfolio-mark";

type ResfolioLogoProps = {
  size?: number;
  variant?: "full" | "mark";
  accent?: string;
  className?: string;
};

/**
 * Resfolio logo.
 *
 * `full`  — the wordmark: "Res" in Instrument Serif + italic "folio", led by
 *           a pulsing accent diamond (the `rf-ping` keyframes in globals.css)
 *           and closed with a period. Pure CSS, no client JS.
 * `mark`  — the standalone icon (see `resfolio-mark.tsx`): a folded page
 *           carrying the brand diamond. Used wherever the wordmark won't fit
 *           (favicon, app icon, avatars).
 */
export default function ResfolioLogo({
  size = 22,
  variant = "full",
  accent = "#ff6a3d",
  className = "",
}: ResfolioLogoProps) {
  const dotSize = Math.round(size * 0.42);

  const pingLayer = (
    <>
      <span
        aria-hidden
        className="relative block rotate-45"
        style={{
          width: dotSize,
          height: dotSize,
          background: accent,
          borderRadius: 2,
          boxShadow: `0 0 10px ${accent}77, 0 0 22px ${accent}33`,
        }}
      />
      <span
        aria-hidden
        className="rf-ping absolute inset-0 rotate-45"
        style={{ borderRadius: 2, border: `1px solid ${accent}`, opacity: 0.6 }}
      />
      <span
        aria-hidden
        className="rf-ping rf-ping-delay absolute inset-0 rotate-45"
        style={{ borderRadius: 2, border: `1px solid ${accent}`, opacity: 0.4 }}
      />
    </>
  );

  if (variant === "mark") {
    return (
      <span
        role="img"
        aria-label="Resfolio"
        className={`inline-flex items-center justify-center ${className}`}
      >
        <ResfolioMark size={size} accent={accent} />
      </span>
    );
  }

  return (
    <span
      aria-label="Resfolio"
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
    >
      <span
        className="relative inline-block -translate-y-1px shrink-0"
        style={{ width: dotSize, height: dotSize }}
      >
        {pingLayer}
      </span>
      <span
        className="font-display leading-none tracking-[-0.02em]"
        style={{ fontSize: size }}
      >
        Res<span className="italic">folio</span>
        <span aria-hidden style={{ color: accent }}>
          .
        </span>
      </span>
    </span>
  );
}

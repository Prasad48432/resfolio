import { cn } from "@resfolio/ui";

/**
 * A placeholder A4 preview of a resume, drawn in pure CSS.
 *
 * This is deliberately **not** a real render — the live preview lives in the
 * editor (`/resumes/[id]`), where the actual template runs in-browser. The list
 * only needs a recognisable "this is a résumé, on this template" glance, so a
 * faux page (paper + skeleton lines) is cheaper than booting a renderer per row
 * and stays fast at any list length. Swap the body for a real thumbnail later
 * without touching the card.
 *
 * The page keeps the resume/portfolio-preview convention: paper is **white in
 * both themes** (a rendered document is a physical thing, doc 08), so the tokens
 * here are intentionally hard-coded rather than theme-aware.
 *
 * `variant` mirrors the two resume template families so the placeholder is
 * informative rather than generic: `classic` is a left-aligned sans masthead,
 * `editorial` a centred serif masthead on a full-width rule.
 */
export function ResumeThumbnail({
  variant,
  className,
}: {
  variant: "classic" | "editorial";
  className?: string;
}) {
  const centered = variant === "editorial";
  return (
    <div
      aria-hidden
      className={cn(
        // A4 is 210×297mm; `aspect-[210/297]` holds true page proportions.
        "aspect-[210/297] w-full overflow-hidden bg-white",
        className,
      )}
    >
      {/* Inner page inset — the "margin" of the faux document. */}
      <div className="flex h-full w-full flex-col gap-[6%] p-[9%]">
        {/* Masthead */}
        <div
          className={cn(
            "flex flex-col gap-[3px]",
            centered ? "items-center" : "items-start",
          )}
        >
          <div className="h-[6px] w-[52%] rounded-full bg-neutral-800" />
          <div className="h-[3px] w-[34%] rounded-full bg-neutral-400" />
          {centered ? (
            <div className="mt-[4px] h-px w-full bg-neutral-300" />
          ) : null}
        </div>

        {/* Body: a few faux sections of decreasing-length lines. */}
        <div className="flex flex-1 flex-col gap-[7%]">
          <FauxSection lines={3} centered={centered} />
          <FauxSection lines={4} centered={centered} />
          <FauxSection lines={2} centered={centered} />
        </div>
      </div>
    </div>
  );
}

/** A faux section: a short title bar then a stack of ragged text lines. */
function FauxSection({ lines, centered }: { lines: number; centered: boolean }) {
  // A deterministic ragged right edge so the lines read as text, not bars.
  const widths = ["100%", "94%", "88%", "97%", "82%"];
  return (
    <div className="flex flex-col gap-[4px]">
      <div
        className={cn(
          "h-[3.5px] w-[26%] rounded-full bg-neutral-500",
          centered ? "self-center" : "self-start",
        )}
      />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-[2.5px] rounded-full bg-neutral-200"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

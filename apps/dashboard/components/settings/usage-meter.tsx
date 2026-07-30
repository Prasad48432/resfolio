import { type FeatureUsage } from "@resfolio/billing";
import { cn } from "@resfolio/ui";

/**
 * One feature's allowance, as a labelled bar.
 *
 * A Server Component with no interactivity and no motion — the numbers are what
 * the user came for, and an animated bar on a settings page is a page that draws
 * attention to the thing the user is least pleased about.
 *
 * **Three states, and the middle one is why this is not just a bar**: normal,
 * near-limit, and exhausted. Doc 14 §6.6 is explicit that a limit discovered by
 * being refused is a pricing lesson delivered at the worst possible moment, so the
 * warning band is load-bearing rather than decorative. The thresholds are the
 * domain's (`NEAR_LIMIT_RATIO`), computed by `summariseUsage`, so this file
 * decides nothing about *when* to warn — only how it looks.
 */
export function UsageMeter({ usage }: { usage: FeatureUsage }) {
  const unlimited = usage.allowed === null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-foreground">{usage.label}</span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            usage.exhausted
              ? "text-brand"
              : usage.nearLimit
                ? "text-foreground"
                : "text-muted",
          )}
        >
          {/* Mono because it is a count the eye scans down a column, which is
              what `lib/navigation`'s "mono means something" rule is for. */}
          {unlimited
            ? `${usage.used} used`
            : `${usage.used} / ${usage.allowed}`}
        </span>
      </div>

      {unlimited ? null : (
        <div
          className="h-1 overflow-hidden rounded-full bg-border"
          // The bar duplicates the number beside it, so it is decoration for a
          // screen reader — the count above is the accessible answer.
          aria-hidden
        >
          <div
            className={cn(
              "h-full rounded-full",
              usage.exhausted
                ? "bg-brand"
                : usage.nearLimit
                  ? "bg-brand/60"
                  : "bg-muted/40",
            )}
            // `fraction` is clamped by the domain, because a downgrade
            // legitimately produces used > allowed and a bar past 100% renders as
            // an overflow bug.
            style={{ width: `${Math.round((usage.fraction ?? 0) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

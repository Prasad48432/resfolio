import { ArrowRight } from "lucide-react";
import { DASHBOARD_URL } from "@/lib/links";
import { cn } from "@/lib/cn";

type GetStartedButtonProps = {
  /** Visible label — defaults to "Get Started". */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
};

/**
 * Primary marketing CTA. A plain link to the dashboard (a separate
 * deployment) — it replaced the waitlist email-capture form once the product
 * went live. Server Component: it's an anchor with no client state.
 */
export default function GetStartedButton({
  label = "Get Started",
  className,
  style,
  testId,
}: GetStartedButtonProps) {
  return (
    <a
      href={DASHBOARD_URL}
      data-testid={testId}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(240,89,43,0.28)] transition hover:bg-brand-soft",
        className,
      )}
      style={style}
    >
      {label}
      <ArrowRight
        size={15}
        aria-hidden
        className="transition group-hover:translate-x-0.5"
      />
    </a>
  );
}

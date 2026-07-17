"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";
import { TEST_IDS } from "@/lib/testids";
import { cn } from "@/lib/cn";

const initialState: WaitlistState = { status: "idle" };

type WaitlistFormProps = {
  /** `hero` renders inline with an "early access" hint; `cta` centers itself. */
  variant?: "hero" | "cta";
  className?: string;
  style?: React.CSSProperties;
};

export default function WaitlistForm({
  variant = "cta",
  className,
  style,
}: WaitlistFormProps) {
  const [state, formAction] = useActionState(joinWaitlist, initialState);

  return (
    <div aria-live="polite" className={className} style={style}>
      {state.status === "success" ? (
        <div
          data-testid={TEST_IDS.waitlistSuccess}
          className={cn(
            "inline-flex items-center gap-3 rounded-full border border-live/30 bg-live/10 px-5 py-3 text-sm text-live",
            variant === "hero" && "mt-8",
            variant === "cta" && "mt-10",
          )}
        >
          <Check size={16} aria-hidden />
          You&rsquo;re in. We&rsquo;ll email{" "}
          <span className="font-mono">{state.email}</span> soon.
        </div>
      ) : (
        <form
          action={formAction}
          data-testid={TEST_IDS.waitlistForm}
          className={cn(
            "flex max-w-lg flex-col items-stretch gap-3 sm:flex-row",
            variant === "hero" && "mt-8",
            variant === "cta" && "mx-auto mt-10 justify-center",
          )}
        >
          <div className="relative flex-1">
            <input
              type="email"
              name="email"
              required
              placeholder="you@makingthings.com"
              aria-label="Email address"
              data-testid={TEST_IDS.waitlistInput}
              className="h-12 w-full rounded-full border border-border bg-surface px-5 pr-28 text-sm text-foreground shadow-[0_1px_2px_rgba(38,32,25,0.04)] outline-none transition placeholder:text-muted/70 focus:border-brand/50"
            />
            {variant === "hero" && (
              <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 font-mono text-[11px] text-muted sm:block">
                early access
              </span>
            )}
          </div>
          <SubmitButton variant={variant} />
          {state.status === "error" && (
            <p
              role="alert"
              data-testid={TEST_IDS.waitlistError}
              className="text-sm text-brand sm:col-span-2"
            >
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function SubmitButton({ variant }: { variant: "hero" | "cta" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={TEST_IDS.waitlistSubmit}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(240,89,43,0.28)] transition hover:bg-brand-soft disabled:opacity-60"
    >
      {pending
        ? "Joining…"
        : variant === "hero"
          ? "Claim my handle"
          : "Join waitlist"}
      <ArrowRight
        size={15}
        aria-hidden
        className="transition group-hover:translate-x-0.5"
      />
    </button>
  );
}

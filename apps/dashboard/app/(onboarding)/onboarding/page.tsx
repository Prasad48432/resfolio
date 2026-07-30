import { requireSession } from "@resfolio/auth";
import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import ResfolioLogo from "@/components/brand/resfolio-logo";
import ResfolioMark from "@/components/brand/resfolio-mark";
import { isAiAvailable } from "@/lib/ai/provider";

export const metadata: Metadata = {
  title: "Welcome — Resfolio",
};

/**
 * Onboarding, step 1 (docs/architecture/16-onboarding.md).
 *
 * A Server Component gate over one client island — the shape `/ai` uses. Both
 * gates that matter are resolved here on the server:
 *
 * - **The session**, for the first name in the greeting. Onboarding is the one
 *   screen in the product that is allowed to say the user's name, because it is
 *   the only one whose job is to feel like an arrival.
 * - **Whether AI is available at all.** `isAiAvailable()` is the same pair of
 *   checks the `/ai` nav item and every AI route use (`AI_ENABLED` plus a
 *   credential), and if it is false the upload card **does not render**. A card
 *   that opens a file picker and then answers 501 is worse than one that was never
 *   offered; in an environment with no key — local dev, CI, a preview deploy —
 *   onboarding is a single "get started" screen. A hidden card is never the only
 *   guard: the route refuses independently.
 *
 * The session read is what makes this route dynamic, which is correct — there is
 * nothing here to cache and the layout has already run a redirect against the
 * database.
 */
export default async function OnboardingPage() {
  const { user } = await requireSession();

  return (
    <>
      {/* Chrome, and there is deliberately almost none: a wordmark that is not a
          link, because the only two exits from this screen are the two decisions
          it is asking for. */}
      <header className="flex h-16 shrink-0 items-center gap-1.5 px-6 md:px-10">
        <ResfolioMark size={26} />
        <ResfolioLogo size={82} className="translate-y-0.5" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 md:px-10">
        <OnboardingFlow
          firstName={user.name.trim().split(/\s+/)[0] ?? ""}
          resumeImportAvailable={isAiAvailable()}
        />
      </main>

      <footer className="flex h-12 shrink-0 items-center justify-center px-6">
        <p className="text-xs text-muted">
          You can change any of this later — nothing here is permanent.
        </p>
      </footer>
    </>
  );
}

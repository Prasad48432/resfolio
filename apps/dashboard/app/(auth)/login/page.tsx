import { getOptionalSession, getSignInProviders } from "@resfolio/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TEST_IDS } from "@/lib/testids";

import { LoginButtons } from "./login-buttons";
import ResfolioLogo from "@/components/brand/resfolio-logo";
import ResfolioMark from "@/components/brand/resfolio-mark";

export const metadata: Metadata = {
  title: "Sign in — Resfolio",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Signed-in users skip the login screen. A *real* session check — the
  // proxy deliberately never redirects away from /login on cookie presence
  // alone (see proxy.ts: stale cookies must land here, not loop).
  const session = await getOptionalSession();
  if (session) {
    redirect("/profile");
  }

  const { error } = await searchParams;
  const providers = getSignInProviders();

  return (
    <div
      className="flex w-full max-w-md flex-col items-center gap-8"
      data-testid={TEST_IDS.loginPage}
    >
      <div className="flex flex-col items-center gap-2 md:gap-3 text-center w-full">
        <h1 className="font-display text-3xl md:text-4xl text-foreground">
          Sign in to your <em className="text-brand">Career OS</em>
        </h1>
        <p className="text-xs md:text-sm leading-relaxed text-muted">
          One profile that powers your resume, portfolio, and personal site.
        </p>
      </div>

      <div className="card-surface flex w-full flex-col gap-3 p-6 shadow-none">
        <LoginButtons providers={providers} />
        {error ? (
          <p
            className="text-center text-xs text-brand"
            role="alert"
            data-testid={TEST_IDS.loginError}
          >
            Sign-in didn&rsquo;t complete. Please try again.
          </p>
        ) : null}
      </div>

      <p className="max-w-xs text-center text-xs leading-relaxed text-muted">
        No passwords — we only ask Google or GitHub who you are. New here?
        Signing in creates your account.
      </p>
    </div>
  );
}

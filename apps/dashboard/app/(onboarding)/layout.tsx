import { requireSession } from "@resfolio/auth";
import { isOnboardingComplete } from "@resfolio/profile/server";
import { redirect } from "next/navigation";

import { ThemeProvider } from "@/components/shell/theme-provider";

/**
 * First-run onboarding (docs/architecture/16-onboarding.md).
 *
 * **Its own route group, and deliberately outside `(dashboard)`.** The app shell
 * is a workspace: a sidebar of nine destinations, a command palette, a top bar
 * naming the section you are in. Every one of those is furniture for someone with
 * a profile, and putting a first-run flow inside it offers a brand-new user
 * navigation to eight screens that are empty and one they have not set up yet.
 * This is a full-viewport, single-decision screen — the one moment in the product
 * where the right number of things to click is two.
 *
 * It carries the **reverse gate**: onboarding is not re-enterable. It is not a
 * settings screen and it does not run again, so a completed user who reaches this
 * URL — from history, from a bookmark, from clicking Back after finishing — goes
 * to their profile rather than to a screen offering to replace it. The forward
 * gate is in the `(dashboard)` layout; between them the two never point at each
 * other, which is what keeps this out of the redirect loop `/login` had to be
 * designed around (doc 10).
 *
 * `ThemeProvider` is mounted here rather than inherited, for the reason the
 * dashboard's own layout gives: it is scoped to the authenticated tree, and this
 * *is* that tree. A user arriving from a dark-themed dashboard on a second device
 * should not get one light screen in the middle of the product. Nothing here uses
 * `card-surface` — that stays `/login`'s and `apps/web`'s.
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();

  if (await isOnboardingComplete(user.id)) {
    redirect("/profile");
  }

  return (
    <ThemeProvider>
      {/* `min-h-dvh` rather than the shell's `h-dvh`: there is no inner scroll
          container here and nothing anchored to the bottom, so the document
          scrolls, which is the right behaviour for a page that grows past the
          fold on a phone. */}
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        {children}
      </div>
    </ThemeProvider>
  );
}

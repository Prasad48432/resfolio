import { requireSession } from "@resfolio/auth";
import { isOnboardingComplete } from "@resfolio/profile/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/components/shell/theme-provider";

/**
 * Server-side session verification for every dashboard route — the layer
 * that is actually trusted, unlike the proxy's optimistic cookie check
 * (docs/architecture/10-auth-and-security.md, route guarding step 2).
 *
 * It is also the **onboarding gate** (doc 16). One place rather than per route:
 * every authenticated screen passes through here, so a user cannot reach the app
 * by bookmark, by a link in an email, or by typing a URL without first having
 * been asked how they want to start. The complement — a finished user who reaches
 * `/onboarding` — is handled by the `(onboarding)` layout, and the two never
 * point at each other, which is what keeps this out of the redirect loop `/login`
 * had to be designed around (doc 10).
 *
 * The cost is one indexed single-column read per navigation, which is why
 * `isOnboardingComplete` is a dedicated query rather than a full
 * `getOrCreateProfile` — and why it does not write. A gate that seeds a profile
 * as a side effect of asking a question would create a row for a user who is
 * about to be sent somewhere else.
 */

/** shadcn's `SidebarProvider` persists the open/closed choice here. Reading it
 * on the server is what keeps a collapsed sidebar from rendering expanded and
 * snapping shut on hydration. */
const SIDEBAR_COOKIE = "sidebar_state";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [{ user }, cookieStore] = await Promise.all([
    requireSession(),
    cookies(),
  ]);

  if (!(await isOnboardingComplete(user.id))) {
    redirect("/onboarding");
  }

  return (
    // Theming is scoped to the authenticated tree, not the root layout — see
    // `ThemeProvider` for why `/login` stays light-only.
    <ThemeProvider>
      <AppShell
        user={{
          name: user.name,
          email: user.email,
          image: user.image ?? null,
        }}
        defaultSidebarOpen={cookieStore.get(SIDEBAR_COOKIE)?.value !== "false"}
      >
        {children}
      </AppShell>
    </ThemeProvider>
  );
}

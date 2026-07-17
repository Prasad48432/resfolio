import { requireSession } from "@resfolio/auth";
import { cookies } from "next/headers";

import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/components/shell/theme-provider";

/**
 * Server-side session verification for every dashboard route — the layer
 * that is actually trusted, unlike the proxy's optimistic cookie check
 * (docs/architecture/10-auth-and-security.md, route guarding step 2).
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

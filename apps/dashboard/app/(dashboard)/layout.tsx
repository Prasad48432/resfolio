import { requireSession } from "@resfolio/auth";

import { AppShell } from "@/components/shell/app-shell";

/**
 * Server-side session verification for every dashboard route — the layer
 * that is actually trusted, unlike the proxy's optimistic cookie check
 * (docs/architecture/10-auth-and-security.md, route guarding step 2).
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}

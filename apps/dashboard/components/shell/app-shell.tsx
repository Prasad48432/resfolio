"use client";

import { SidebarInset, SidebarProvider, TooltipProvider } from "@resfolio/ui";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { TEST_IDS } from "@/lib/testids";

import { RouteTransition } from "@/components/motion/route-transition";

import { CommandPalette } from "./command-palette";
import { AppSidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
}

/**
 * The app shell (docs/architecture/08-dashboard-ux.md): left sidebar, slim top
 * bar, cmd+k palette. Built on shadcn/ui's `SidebarProvider`/`SidebarInset`,
 * which own the responsive and collapse behaviour (mobile Sheet, icon rail,
 * cookie-persisted state, cmd+b).
 *
 * `defaultOpen` comes from the server (the `sidebar_state` cookie, read in the
 * `(dashboard)` layout) rather than from a client effect — otherwise a
 * collapsed sidebar renders expanded on the server and snaps shut on hydration.
 *
 * Only the content region transitions on navigation — the sidebar and top bar
 * are persistent chrome, and animating them would re-announce furniture that
 * never moved.
 */
export function AppShell({
  user,
  defaultSidebarOpen = true,
  children,
}: {
  user: ShellUser;
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  return (
    // `delayDuration={0}` only affects the collapsed rail's icon tooltips:
    // there, the label *is* the nav, so making someone wait 700ms to learn
    // where a button goes defeats the rail.
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar user={user} />
        <SidebarInset data-testid={TEST_IDS.appShell}>
          <TopBar onOpenPalette={() => setPaletteOpen(true)} />
          <main className="flex-1 px-6 py-6">
            {/* `children` is the server-rendered route, passed straight through
                as a prop — the transition wrapper is a client island but the
                pages inside it stay Server Components. */}
            <RouteTransition routeKey={pathname}>{children}</RouteTransition>
          </main>
        </SidebarInset>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

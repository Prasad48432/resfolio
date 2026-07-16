"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { TEST_IDS } from "@/lib/testids";

import { RouteTransition } from "@/components/motion/route-transition";

import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
}

/**
 * The app shell (docs/architecture/08-dashboard-ux.md): narrow fixed left
 * sidebar, slim top bar, cmd+k palette. Client component for palette state
 * and active-route styling; page content stays server-rendered via children.
 *
 * Only the content region transitions on navigation — the sidebar and top bar
 * are persistent chrome, and animating them would re-announce furniture that
 * never moved.
 */
export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen" data-testid={TEST_IDS.appShell}>
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 px-6 py-6">
          {/* `children` is the server-rendered route, passed straight through
              as a prop — the transition wrapper is a client island but the
              pages inside it stay Server Components. */}
          <RouteTransition routeKey={pathname}>{children}</RouteTransition>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

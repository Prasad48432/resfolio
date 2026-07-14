"use client";

import { useState } from "react";

import { TEST_IDS } from "@/lib/testids";

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
 */
export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex min-h-screen" data-testid={TEST_IDS.appShell}>
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

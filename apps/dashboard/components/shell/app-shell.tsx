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
 *
 * ## The height chain, which is load-bearing
 *
 * **The shell is exactly one viewport tall and the content region is the app's
 * scroll container.** Not a preference — it is what makes a full-height surface
 * (the AI chat) possible at all. Before this, `SidebarInset` had no bounded
 * height, so every `flex-1` and `h-full` below it resolved against `auto`: the
 * chat's message list grew to fit its content, the *page* scrolled instead of the
 * list, and the composer walked off the bottom of the screen. No amount of
 * `min-h-0` on the chat could fix that, because the constraint it needed to
 * inherit did not exist.
 *
 * Three parts, and each is required:
 *
 * 1. **`h-dvh overflow-hidden` on the inset.** `dvh` looks like the risky choice —
 *    it tracks mobile browser chrome, so it can resize the scroll container under
 *    the reader's thumb — but that risk is removed by the very change below it:
 *    browsers collapse their chrome in response to *document* scroll, and after
 *    this the document never scrolls, so `dvh` sits still in practice. What it buys
 *    is the case `svh` cannot handle at all: with `interactiveWidget:
 *    "resizes-content"` (root layout), the mobile keyboard shrinks the layout
 *    viewport and `dvh` follows it, which is what keeps the chat composer above the
 *    keyboard instead of behind it.
 * 2. **The content region is `grid` with `grid-rows-[minmax(0,1fr)]`.** This is
 *    the primitive that does the actual work: the row's `max` of `1fr` gives its
 *    child a *definite* height (so `flex-1` and `h-full` inside it mean
 *    something), and the `min` of `0` lets a taller page overflow instead of
 *    stretching the row — at which point this container scrolls, exactly as body
 *    scroll used to. A plain `flex-1` child would have given the child a definite
 *    height too, but only by also making every ordinary page unable to exceed it.
 * 2b. **`grid-cols-[minmax(0,1fr)]` is required for the same reason, and its
 *    absence was a real bug.** An implicit grid column is an `auto` track, whose
 *    *minimum* is the item's min-content width — so the track could not shrink
 *    below the widest unbreakable thing on the page, and everything in it grew to
 *    match. That is why a long token in a pasted job description pushed the
 *    **page header** off the right edge: `overflow-wrap: break-word` lets a long
 *    word break when it would overflow, but it deliberately does **not** reduce
 *    the min-content contribution, so the track sized to the unbroken word while
 *    the paragraph rendered wrapped. The symptom is always the same and never
 *    looks like a grid problem: unrelated text on the page stops wrapping at the
 *    viewport. Pinning the column at `minmax(0, 1fr)` makes the track exactly the
 *    container's width; anything that still cannot shrink now overflows inside its
 *    own box instead of widening the app.
 * 3. **`RouteTransition` must always render a flex column** (see that file). It
 *    sits between here and the page, so if it passes children through bare, the
 *    chain is severed one level above where anyone thinks to look.
 *
 * The result: ordinary pages behave exactly as before except the scrollbar lives
 * on the content region rather than on `<body>`, the top bar is genuinely fixed
 * because it is outside the scroller, and a page that asks for `flex-1` gets the
 * viewport.
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
        <SidebarInset
          className="h-dvh overflow-hidden"
          data-testid={TEST_IDS.appShell}
        >
          <TopBar onOpenPalette={() => setPaletteOpen(true)} />
          {/* A `div`, not a `main`: `SidebarInset` already renders one, and two
              nested `main` landmarks is invalid HTML that a screen reader
              announces twice. */}
          <div
            className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-y-auto overscroll-contain scrollbar-thin px-4 py-6 sm:px-6"
            data-testid={TEST_IDS.appContent}
          >
            {/* `children` is the server-rendered route, passed straight through
                as a prop — the transition wrapper is a client island but the
                pages inside it stay Server Components. */}
            <RouteTransition routeKey={pathname}>{children}</RouteTransition>
          </div>
        </SidebarInset>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

"use client";

import { cn } from "@resfolio/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/navigation";
import { navItemTestId, TEST_IDS } from "@/lib/testids";

import { UserMenu } from "./user-menu";
import type { ShellUser } from "./app-shell";

export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 flex h-screen w-(--spacing-sidebar) shrink-0 flex-col border-r border-border bg-background"
      data-testid={TEST_IDS.sidebar}
    >
      <div className="flex h-(--spacing-topbar) shrink-0 items-center border-b border-border px-4">
        {/* The wordmark keeps Instrument Serif. This is the one place in the
            product where the brand voice belongs — it's identity, not UI. */}
        <Link
          href="/profile"
          className="rounded-md font-display text-xl text-foreground"
          aria-label="Resfolio home"
        >
          Resfolio<span className="text-accent">.</span>
        </Link>
      </div>

      <nav
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        aria-label="Primary"
        data-testid={TEST_IDS.sidebarNav}
      >
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`/${item.key}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              // Nav is hit constantly, so it does not animate on click and the
              // hover transition is only a press-length colour fade — anything
              // longer feels like the nav is lagging behind the cursor.
              // Every item carries a border, transparent when inactive, so
              // becoming active changes colour and never nudges layout. The
              // active surface is only a shade off the page, which is the
              // point: the hairline is what makes it legible.
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors duration-(--duration-press) ease-out",
                active
                  ? "border-border bg-surface font-medium text-foreground"
                  : "border-transparent text-muted hover:bg-surface/70 hover:text-foreground",
              )}
              data-testid={navItemTestId(item.key)}
            >
              <Icon
                className={cn("size-4 shrink-0", active && "text-accent")}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}

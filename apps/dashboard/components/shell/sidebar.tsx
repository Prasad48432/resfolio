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
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-background"
      data-testid={TEST_IDS.sidebar}
    >
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link
          href="/profile"
          className="font-display text-xl text-foreground"
          aria-label="Resfolio home"
        >
          Resfolio<span className="text-accent">.</span>
        </Link>
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
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
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface font-medium text-foreground shadow-[inset_0_0_0_1px_var(--color-border)]"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
              data-testid={navItemTestId(item.key)}
            >
              <Icon
                className={cn("size-4", active ? "text-accent" : "")}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}

"use client";

import { cn } from "@resfolio/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { TEST_IDS } from "@/lib/testids";

/**
 * Settings' own sub-navigation.
 *
 * It exists because Settings became the first section with more than one page
 * (account, AI usage) and the sidebar deliberately carries **one** row for the
 * whole section — doc 08's rule is that the sidebar is the product's shape, and
 * "Settings → Account" plus "Settings → AI usage" as two top-level rows would put
 * configuration on the same footing as the Profile.
 *
 * A client component only for `usePathname`: the active state is the whole
 * behaviour, and computing it on the server would mean passing the current
 * segment into both pages by hand. Rendered by every settings page — never
 * hand-rolled — for the same reason `PageHeader` is.
 */

const TABS = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/ai-usage", label: "AI usage" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-1 border-b border-border"
      aria-label="Settings sections"
      data-testid={TEST_IDS.settingsNav}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            // `aria-current` is the accessible half of "active"; the underline is
            // the visual half. Both, because either alone leaves one kind of user
            // unable to tell where they are.
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors duration-(--duration-press) ease-out",
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

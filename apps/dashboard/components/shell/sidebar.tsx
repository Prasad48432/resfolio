"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
  cn,
} from "@resfolio/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/navigation";
import { navItemTestId, TEST_IDS } from "@/lib/testids";

import { UserMenu } from "./user-menu";
import type { ShellUser } from "./app-shell";
import ResfolioLogo from "../brand/resfolio-logo";

/**
 * The primary navigation (docs/architecture/08-dashboard-ux.md), composed from
 * shadcn/ui's `Sidebar` rather than a hand-rolled `<aside>`.
 *
 * What that buys — and the reason for the swap — is everything a hand-rolled
 * one quietly lacked: below `md` it becomes a `Sheet` with a focus trap and
 * `Escape` handling; it collapses to an icon rail and persists that in a
 * cookie, so the choice survives a reload *and* is known during SSR (no
 * flash); `SidebarRail` makes the whole edge a drag target; and the collapsed
 * state grows tooltips on the icons automatically.
 *
 * What stays ours: `lib/navigation.ts` is still the single IA source (the
 * palette reads the same list), the Instrument Serif wordmark, the active
 * rule, and the token vocabulary — shadcn's `--sidebar-*` tokens are bridged
 * onto @resfolio/design in `@resfolio/design/shadcn`, so this is Resfolio's
 * chrome with shadcn's behaviour, not shadcn's look.
 */
export function AppSidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" data-testid={TEST_IDS.sidebar}>
      <SidebarHeader className="h-(--spacing-topbar) justify-center border-b border-border px-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        {/* The wordmark keeps Instrument Serif. This is the one place in the
            product where the brand voice belongs — it's identity, not UI.

            Two logos, one shown at a time. The rail is 3rem and the header
            carries `px-4`, leaving a 16px content box — so the header drops its
            padding and centres when collapsed, or the mark would be squeezed
            into a sliver. Previously the whole `Link` was hidden here, which
            left the collapsed rail with no brand at all.

            The swap is `display`, not a cross-fade: it costs no layout shift
            (the header is a fixed `--spacing-topbar` tall either way) and the
            Sidebar's own width transition already carries the motion. Two
            absolutely-stacked, opacity-fading logos would animate against a
            box that is itself resizing — more moving parts, worse result.

            NOTE: the visibility classes live on wrapper spans, not on
            `ResfolioLogo`'s `className`. That component concatenates the string
            onto its own `inline-flex` with no tailwind-merge, so `hidden` and
            `inline-flex` would both survive at equal specificity and the winner
            would come down to Tailwind's emit order. */}
        <Link
          href="/profile"
          className="flex items-center rounded-md text-foreground"
          aria-label="Resfolio home"
        >
          <span className="group-data-[collapsible=icon]:hidden">
            <ResfolioLogo size={28} />
          </span>
          {/* `mark` is the variant the brand system already documents as "used
              wherever the wordmark won't fit". Static, not the pulsing ping:
              doc 08 settled that the product's palette doesn't animate, and an
              icon that pulses forever in the corner of every screen is the
              clearest possible violation of that. */}
          <span className="hidden group-data-[collapsible=icon]:flex">
            <ResfolioLogo variant="mark" size={26} />
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* `gap-1` — the registry ships `gap-0`, which butts the items
                against each other. Once an active item carries a background,
                flush rows read as one continuous block rather than a list. */}
            <SidebarMenu className="gap-1" data-testid={TEST_IDS.sidebarNav}>
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`/${item.key}`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.key}>
                    {/* `tooltip` is what makes the collapsed rail usable —
                        the Sidebar only renders it when collapsed.

                        The `text-muted` on inactive items is doc 08's rule,
                        not decoration: the nav is furniture you look past all
                        day, so only the page you're on earns full contrast.
                        shadcn's default gives every item `sidebar-foreground`,
                        which made the whole column shout.

                        Active and hover are both overridden here because the
                        registry spends ONE token on BOTH — `hover:bg-sidebar-
                        accent` and `data-active:bg-sidebar-accent` are the same
                        colour, so the current page was literally indis-
                        tinguishable from whatever the mouse was over. And that
                        token bridges to `surface-warm` (#fbf3ea), 2% off the
                        sidebar's own `background` (#f6f1e8) — invisible.

                        The split: active gets a *brand* wash, hover gets a
                        *neutral* ink wash. Different hue, not just different
                        alpha, so the two never read as the same state at a
                        glance. Both are alpha over the sidebar, so they hold up
                        in either theme; only the active wash needs a nudge in
                        dark, where a 10% warm tint on near-black disappears.
                        Retuning the bridge token could not do this — it feeds
                        hover and active alike.

                        The active branch sets `hover:` to the *same* value as
                        `data-active:` deliberately. tailwind-merge drops the
                        registry's `data-active:bg-sidebar-accent` (same
                        modifier set as ours) but KEEPS its
                        `hover:bg-sidebar-accent` — a different set — and the
                        two carry equal specificity, so on hover the winner
                        would come down to Tailwind's emit order and the active
                        item would flicker back to the invisible wash. Naming
                        `hover:` explicitly evicts it, and pointing it at the
                        same alpha makes the outcome identical either way. The
                        current page not reacting to hover is also just right:
                        you are already there. */}
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        // The collapsed rail's `size-8!`/`p-2!` carry `!`, so
                        // they still win over these — the icon rail is unchanged.
                        "h-9 gap-2.5 rounded-lg px-2.5 transition-colors duration-(--duration-press) ease-out",
                        active
                          ? [
                              "data-active:bg-brand/10 hover:bg-brand/10",
                              "data-active:text-foreground hover:text-foreground",
                              "dark:data-active:bg-brand/15 dark:hover:bg-brand/15",
                            ]
                          : "text-muted hover:bg-foreground/5 hover:text-foreground",
                      )}
                    >
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        data-testid={navItemTestId(item.key)}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon
                          className={cn("shrink-0", active && "text-brand")}
                          aria-hidden
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <UserMenu user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

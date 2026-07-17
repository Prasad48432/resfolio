"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@resfolio/ui";
import { ChevronsUpDown, LogOut, Mail, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { TEST_IDS } from "@/lib/testids";
import { useSignOut } from "@/lib/use-sign-out";

import type { ShellUser } from "./app-shell";
import { ThemeToggle } from "./theme-toggle";

function Avatar({ user }: { user: ShellUser }) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={28}
        height={28}
        // `max-w-none` is a guard, not the fix — measured, not assumed.
        //
        // The ellipse came from Tailwind preflight's `img { max-width: 100% }`:
        // max-width beats width, so in the collapsed rail's ~15px content box
        // the image was capped at 13px while `size-7` held the height at 28px.
        // (`shrink-0` is no help — that's flex shrink, this is max-width.)
        // Hiding the identity block and chevron below is what actually gives
        // the avatar its 31px back, and it alone restores the circle.
        //
        // This stays because "the avatar is always a 28px circle" is the
        // invariant, and without it that invariant silently depends on the
        // trigger's padding: re-add a little, and the squash returns with no
        // error anywhere. Reproduced both ways in the browser before keeping.
        className="size-7 max-w-none shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-warm text-xs font-semibold text-brand"
    >
      {user.name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function UserMenu({ user }: { user: ShellUser }) {
  const { signOut, signingOut } = useSignOut();

  return (
    <DropdownMenu>
      {/* Collapsed, this becomes an avatar button and nothing else: the rail is
          3rem, and the identity block + chevron had no room to live there —
          they simply overflowed the trigger. Dropping the padding and gap and
          centring leaves the 28px avatar comfortably inside the 31px content
          box. Hover/focus/open states are untouched, so the target still
          responds; only what's *in* it changes. */}
      <DropdownMenuTrigger
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors duration-(--duration-press) ease-out hover:border-border hover:bg-surface data-[state=open]:border-border data-[state=open]:bg-surface group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
        aria-label="Account menu"
        data-testid={TEST_IDS.userMenuTrigger}
      >
        <Avatar user={user} />
        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {user.name}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {user.email}
          </span>
        </span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted group-data-[collapsible=icon]:hidden"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>
          <span className="flex items-center gap-1.5">
            <Mail size={13} /> <p className="truncate">{user.email}</p>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeToggle />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          data-testid={TEST_IDS.userMenuSignOut}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@resfolio/ui";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { TEST_IDS } from "@/lib/testids";
import { useSignOut } from "@/lib/use-sign-out";

import type { ShellUser } from "./app-shell";

function Avatar({ user }: { user: ShellUser }) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-full border border-border"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-warm text-xs font-semibold text-accent"
    >
      {user.name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function UserMenu({ user }: { user: ShellUser }) {
  const { signOut, signingOut } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface"
        aria-label="Account menu"
        data-testid={TEST_IDS.userMenuTrigger}
      >
        <Avatar user={user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {user.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {user.email}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
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

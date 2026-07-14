"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@resfolio/ui";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NAV_ITEMS } from "@/lib/navigation";
import { paletteItemTestId, TEST_IDS } from "@/lib/testids";
import { useSignOut } from "@/lib/use-sign-out";

/**
 * cmd+k command palette (docs/architecture/08-dashboard-ux.md) — the
 * keyboard-first backbone. Navigation now; actions, search, and AI commands
 * attach here in later phases.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { signOut } = useSignOut();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid={TEST_IDS.commandPalette}
    >
      <CommandInput
        placeholder="Type a command or search…"
        data-testid={TEST_IDS.commandPaletteInput}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.key}
                onSelect={() => run(() => router.push(item.href))}
                data-testid={paletteItemTestId(item.key)}
              >
                <Icon aria-hidden />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Account">
          <CommandItem
            onSelect={() => run(() => void signOut())}
            data-testid={paletteItemTestId("sign-out")}
          >
            <LogOut aria-hidden />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

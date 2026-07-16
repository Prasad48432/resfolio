"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { sectionLabelFor } from "@/lib/navigation";
import { TEST_IDS } from "@/lib/testids";

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-10 flex h-(--spacing-topbar) shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-md"
      data-testid={TEST_IDS.topBar}
    >
      <h1
        className="truncate text-[13px] font-medium text-foreground"
        data-testid={TEST_IDS.topBarTitle}
      >
        {sectionLabelFor(pathname)}
      </h1>

      {/* Deliberately not a <Button>. That primitive is a pill built for
          actions; this is a search affordance and should read as a field —
          rectangular, left-aligned label, shortcut parked on the right.
          Styling a Button into this shape would mean overriding most of what
          makes it a Button. */}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        className="flex h-8 w-56 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface/60 px-2.5 text-left transition-colors duration-(--duration-press) ease-out hover:border-accent/30 hover:bg-surface"
        data-testid={TEST_IDS.commandPaletteTrigger}
      >
        <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
        <span className="flex-1 text-[13px] text-muted">Search…</span>
        <kbd className="shrink-0 rounded border border-border bg-background px-1 py-px font-mono text-[10px] text-muted">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}

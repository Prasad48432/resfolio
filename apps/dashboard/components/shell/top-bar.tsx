"use client";

import { Button } from "@resfolio/ui";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { sectionLabelFor } from "@/lib/navigation";
import { TEST_IDS } from "@/lib/testids";

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-8 backdrop-blur"
      data-testid={TEST_IDS.topBar}
    >
      <h1
        className="text-sm font-medium text-foreground"
        data-testid={TEST_IDS.topBarTitle}
      >
        {sectionLabelFor(pathname)}
      </h1>
      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        data-testid={TEST_IDS.commandPaletteTrigger}
      >
        <Search aria-hidden />
        <span className="text-muted">Search…</span>
        <kbd className="ml-1 rounded-md border border-border bg-background px-1.5 font-mono text-[10px] text-muted">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}

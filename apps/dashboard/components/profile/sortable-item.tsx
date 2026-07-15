"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@resfolio/ui";
import { ChevronDown, GripVertical, X } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * One reorderable, collapsible item card. The drag handle is the grip only
 * (so field interactions never start a drag); keyboard drag is supported by
 * dnd-kit's sortable keyboard sensor. Expanded by default for a freshly
 * added item so its fields are immediately editable.
 */
export function SortableItem({
  id,
  title,
  subtitle,
  defaultOpen,
  onRemove,
  removeLabel,
  testId,
  removeTestId,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  onRemove: () => void;
  removeLabel: string;
  testId?: string;
  removeTestId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card-surface overflow-hidden ${isDragging ? "opacity-60" : ""}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-surface-warm hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-warm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {title}
            </span>
            {subtitle ? (
              <span className="block truncate text-xs text-muted">
                {subtitle}
              </span>
            ) : null}
          </span>
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={removeLabel}
          onClick={onRemove}
          data-testid={removeTestId}
        >
          <X aria-hidden />
        </Button>
      </div>

      {open ? (
        <div className="border-t border-border px-4 py-4">{children}</div>
      ) : null}
    </div>
  );
}

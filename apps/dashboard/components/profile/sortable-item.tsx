"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card, cn } from "@resfolio/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  const reduceMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // A lifted row reads as picked up. The shadow is the one thing here
      // that legitimately implies elevation, because during a drag the row
      // genuinely is above the list — everywhere else, borders do the work.
      className={cn(
        "overflow-hidden",
        isDragging &&
          "relative z-10 border-brand/40 shadow-[0_8px_24px_rgba(38,32,25,0.10)]",
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted transition-colors duration-(--duration-press) ease-out hover:bg-surface-warm hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-(--duration-press) ease-out hover:bg-surface-warm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-(--duration-base) ease-out",
              !open && "-rotate-90",
            )}
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

      {/* Expanding is one of the few places height must animate: the row
          physically grows, and cutting straight to the open state makes the
          rows below jump. Height is not compositor-friendly, but the
          alternative here is worse, and this fires on click — not on every
          frame of a drag. `overflow-hidden` keeps the fields clipped to the
          growing box instead of spilling during the transition. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.2,
              ease: [0.23, 1, 0.32, 1],
              // Opacity trails the height on the way in and leads it on the
              // way out, so content never fades in against a box that hasn't
              // finished opening.
              opacity: { duration: reduceMotion ? 0 : 0.15 },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}

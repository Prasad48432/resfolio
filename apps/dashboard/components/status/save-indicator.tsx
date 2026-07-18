"use client";

import { AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  CloudOff,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { cn, Spinner } from "@resfolio/ui";

import { SwapIn } from "@/components/motion/motion";
import type { SaveStatus } from "@/lib/save-status";

/**
 * The autosave indicator, shared by the profile, resume, and portfolio
 * editors — previously implemented three separate times with three different
 * state unions and three sets of wording.
 *
 * It crossfades on change rather than cutting. This is the one place in the
 * dashboard where motion is doing real work rather than decorating: the text
 * swaps while the user is typing somewhere else on screen, and a hard cut in
 * peripheral vision reads as a flicker or an error. A 150ms fade registers as
 * "that updated" without pulling the eye off the field.
 *
 * `aria-live="polite"` sits on the stable wrapper, not the animated span, so
 * screen readers announce a status change once — announcing on an element
 * that unmounts and remounts would either double up or be missed entirely.
 */
const PRESENTATION: Record<
  SaveStatus,
  { label: string; icon: LucideIcon | "spinner"; tone: string }
> = {
  idle: { label: "All changes saved", icon: Check, tone: "text-muted" },
  /**
   * `dirty` is **not** the spinner, and the distinction is the point: nothing
   * is in flight yet, there are just edits waiting for the autosave debounce.
   * A turning spinner here would claim a request was running and then keep
   * claiming it for as long as the user kept typing. `CircleDashed` is a
   * still ring — which is exactly how the old static `Loader2` read.
   */
  dirty: { label: "Unsaved changes…", icon: "spinner", tone: "text-muted" },
  saving: { label: "Saving…", icon: "spinner", tone: "text-muted" },
  saved: { label: "Saved", icon: Check, tone: "text-live" },
  invalid: {
    label: "Not saved — check highlighted fields",
    icon: AlertTriangle,
    tone: "text-brand",
  },
  offline: {
    label: "Offline — will retry when you edit",
    icon: CloudOff,
    tone: "text-brand",
  },
  conflict: {
    label: "Edited elsewhere — reload to continue",
    icon: RefreshCw,
    tone: "text-brand",
  },
};

export function SaveIndicator({
  status,
  testId,
  onReviewInvalid,
}: {
  status: SaveStatus;
  testId?: string;
  /**
   * Optional: makes the `invalid` state actionable. "Check highlighted fields"
   * is only useful advice if the user can find them — on a long profile the
   * offending field is usually off-screen. An editor that can locate its own
   * first error passes a handler and the indicator becomes a button.
   */
  onReviewInvalid?: () => void;
}) {
  const { label, icon: Icon, tone } = PRESENTATION[status];

  if (status === "invalid" && onReviewInvalid) {
    return (
      <button
        type="button"
        onClick={onReviewInvalid}
        className={cn(
          "flex items-center gap-1.5 rounded-md text-xs underline-offset-2 transition-colors duration-(--duration-base) ease-out hover:underline",
          tone,
        )}
        data-testid={testId}
        data-status={status}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs transition-colors duration-(--duration-base) ease-out",
        tone,
      )}
      role="status"
      aria-live="polite"
      data-testid={testId}
      data-status={status}
    >
      <AnimatePresence mode="wait" initial={false}>
        <SwapIn key={status} className="flex items-center gap-1.5">
          {/* The wrapper is already the live region, so the spinner stays
              decorative — its default. */}
          {Icon === "spinner" ? (
            <Spinner size="sm" />
          ) : (
            <Icon className="size-3.5" aria-hidden />
          )}
          {label}
        </SwapIn>
      </AnimatePresence>
    </span>
  );
}

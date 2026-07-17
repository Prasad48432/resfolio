"use client";

import { AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@resfolio/ui";

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
  { label: string; icon: LucideIcon; tone: string }
> = {
  idle: { label: "All changes saved", icon: Check, tone: "text-muted" },
  dirty: { label: "Unsaved changes…", icon: Loader2, tone: "text-muted" },
  saving: { label: "Saving…", icon: Loader2, tone: "text-muted" },
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
}: {
  status: SaveStatus;
  testId?: string;
}) {
  const { label, icon: Icon, tone } = PRESENTATION[status];

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
          <Icon
            className={cn("size-3.5", status === "saving" && "animate-spin")}
            aria-hidden
          />
          {label}
        </SwapIn>
      </AnimatePresence>
    </span>
  );
}

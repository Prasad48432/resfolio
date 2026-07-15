"use client";

import {
  AlertTriangle,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { TEST_IDS } from "@/lib/testids";

import type { SaveStatus } from "./use-profile-autosave";

const PRESENTATION: Record<
  SaveStatus,
  { label: string; icon: typeof Check; tone: string }
> = {
  idle: { label: "All changes saved", icon: Check, tone: "text-muted" },
  dirty: { label: "Unsaved changes…", icon: Loader2, tone: "text-muted" },
  saving: { label: "Saving…", icon: Loader2, tone: "text-muted" },
  saved: { label: "Saved", icon: Check, tone: "text-live" },
  invalid: {
    label: "Not saved — check highlighted fields",
    icon: AlertTriangle,
    tone: "text-accent",
  },
  offline: {
    label: "Offline — will retry when you edit",
    icon: CloudOff,
    tone: "text-accent",
  },
  conflict: {
    label: "Edited elsewhere — reload to continue",
    icon: RefreshCw,
    tone: "text-accent",
  },
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const { label, icon: Icon, tone } = PRESENTATION[status];
  const spinning = status === "saving";
  return (
    <span
      className={`flex items-center gap-1.5 text-xs ${tone}`}
      role="status"
      aria-live="polite"
      data-testid={TEST_IDS.profileSaveIndicator}
      data-status={status}
    >
      <Icon
        className={`size-3.5 ${spinning ? "animate-spin" : ""}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

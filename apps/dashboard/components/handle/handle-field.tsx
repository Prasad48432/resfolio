"use client";

import { Input, Spinner } from "@resfolio/ui";
import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { checkHandleAvailabilityAction } from "@/app/(dashboard)/handle/actions";

/**
 * The shared public-username input (docs/architecture/04-deployment.md). A
 * handle is a profile identity used by both the portfolio and resume outputs,
 * so this control is claimed from **either** `/portfolio` or `/resumes`. It owns
 * the debounced live availability check against the domain's rules + reserved
 * blocklist + uniqueness, and reports its state up so a parent can gate a
 * claim/create button. Presentation only — the parent owns what "claim" does.
 */
export type HandleState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "invalid"; reason: string }
  | { status: "taken" };

export function HandleField({
  id,
  value,
  onValueChange,
  onStateChange,
  prefix = "resfolio.me/",
  disabled = false,
  inputTestId,
  statusTestId,
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  /** Reports availability so the parent can enable/disable its action. */
  onStateChange?: (state: HandleState) => void;
  /** The read-only origin shown before the input (e.g. `resfolio.me/p/`). */
  prefix?: string;
  disabled?: boolean;
  inputTestId?: string;
  statusTestId?: string;
}) {
  const [state, setState] = useState<HandleState>({ status: "idle" });

  const check = useCallback(
    async (candidate: string) => {
      if (!candidate) {
        setState({ status: "idle" });
        onStateChange?.({ status: "idle" });
        return;
      }
      setState({ status: "checking" });
      onStateChange?.({ status: "checking" });
      try {
        const result = await checkHandleAvailabilityAction({
          handle: candidate,
        });
        let next: HandleState;
        if (!result.ok) {
          next = { status: "invalid", reason: "Try another name" };
        } else if (!result.data.valid) {
          next = {
            status: "invalid",
            reason: result.data.reason ?? "Not a valid name",
          };
        } else if (!result.data.available) {
          next = { status: "taken" };
        } else {
          next = { status: "ok" };
        }
        setState(next);
        onStateChange?.(next);
      } catch {
        setState({ status: "idle" });
        onStateChange?.({ status: "idle" });
      }
    },
    [onStateChange],
  );

  // Debounced live availability check as the user types.
  useEffect(() => {
    const timer = setTimeout(() => void check(value), 400);
    return () => clearTimeout(timer);
  }, [value, check]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{prefix}</span>
        <div className="relative flex-1">
          <Input
            id={id}
            value={value}
            spellCheck={false}
            autoCapitalize="none"
            disabled={disabled}
            onChange={(event) =>
              onValueChange(event.target.value.toLowerCase().trim())
            }
            className="pr-9 font-mono"
            data-testid={inputTestId}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <HandleIndicator state={state} />
          </span>
        </div>
      </div>
      <HandleMessage state={state} statusTestId={statusTestId} />
    </div>
  );
}

function HandleIndicator({ state }: { state: HandleState }) {
  if (state.status === "checking") {
    return <Spinner className="text-muted" label="Checking availability" />;
  }
  if (state.status === "ok") {
    return <Check className="size-4 text-brand" aria-hidden />;
  }
  if (state.status === "taken" || state.status === "invalid") {
    return <X className="size-4 text-brand" aria-hidden />;
  }
  return null;
}

function HandleMessage({
  state,
  statusTestId,
}: {
  state: HandleState;
  statusTestId?: string;
}) {
  const text =
    state.status === "taken"
      ? "That name is taken — try another."
      : state.status === "invalid"
        ? state.reason
        : state.status === "ok"
          ? "Available"
          : "";
  if (!text) {
    return null;
  }
  return (
    <span
      className={`text-xs ${state.status === "ok" ? "text-muted" : "text-brand"}`}
      role="status"
      data-testid={statusTestId}
      data-status={state.status}
    >
      {text}
    </span>
  );
}

"use client";

import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";

import { cn } from "../lib/cn";
import { useIsMobile } from "../hooks/use-mobile";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * A **month + year** picker — never a day. The profile schema's calendar dates
 * are `YYYY` | `YYYY-MM` | `YYYY-MM-DD`, but no career fact this app collects
 * is precise to the day, and a full calendar invites a precision the resume
 * then has to throw away. Value in/out is always `""` (unset) or `YYYY-MM`.
 *
 * `YYYY-MM` strings compare **lexicographically** in date order, which is why
 * `min`/`max` here are plain string comparisons rather than Date arithmetic —
 * no timezone can move a value across a boundary. That property is the whole
 * reason this component can enforce "end is never before start" by *disabling*
 * the impossible choices instead of validating after the fact.
 *
 * Responsive by construction: a `Popover` on pointer devices, a centred
 * `Dialog` on mobile, where a 260px popover anchored to a field near the
 * bottom of the viewport is unusable.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const YEARS_PER_PAGE = 12;

/** `"2021-03"` → `"Mar 2021"`; tolerates a bare `YYYY` or a stored `-DD`. */
export function formatMonthYear(value: string): string {
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(value);
  if (!match) {
    return "";
  }
  const [, year, month] = match;
  if (!month) {
    return year!;
  }
  const index = Number(month) - 1;
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : year!;
}

/** The `YYYY` half of any accepted value, or `null`. */
function yearOf(value: string): number | null {
  const match = /^(\d{4})/.exec(value);
  return match ? Number(match[1]) : null;
}

/** The 1-based month, or `null` when the value carries only a year. */
function monthOf(value: string): number | null {
  const match = /^\d{4}-(\d{2})/.exec(value);
  return match ? Number(match[1]) : null;
}

const pad = (month: number) => String(month).padStart(2, "0");

export interface MonthYearPickerProps extends Omit<
  ComponentProps<"button">,
  "value" | "onChange"
> {
  /** `""` (unset) or `YYYY-MM`. A stored `YYYY`/`YYYY-MM-DD` renders fine. */
  value: string;
  onChange: (value: string) => void;
  /** Inclusive earliest selectable month, `YYYY-MM`. */
  min?: string;
  /** Inclusive latest selectable month, `YYYY-MM`. */
  max?: string;
  /** Offer "Present" (clears the value) — end dates only. */
  allowPresent?: boolean;
  placeholder?: string;
  invalid?: boolean;
}

export function MonthYearPicker({
  value,
  onChange,
  min,
  max,
  allowPresent = false,
  placeholder = "Select month",
  invalid = false,
  className,
  disabled,
  ...props
}: MonthYearPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const panel = (
    <MonthYearPanel
      value={value}
      min={min}
      max={max}
      allowPresent={allowPresent}
      onCommit={(next) => {
        onChange(next);
        setOpen(false);
      }}
    />
  );

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      // Matches Input's box so a row of fields lines up: same height, radius,
      // border and focus treatment. `data-placeholder` carries the muted text
      // so the empty state reads as a placeholder, not as a value.
      data-placeholder={value ? undefined : ""}
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 text-left text-sm text-foreground",
        "transition-colors duration-(--duration-fast) ease-out hover:border-brand/30",
        "data-placeholder:text-muted/70",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    >
      <span className="truncate">
        {value
          ? formatMonthYear(value)
          : allowPresent
            ? "Present"
            : placeholder}
      </span>
      <Calendar className="size-4 shrink-0 text-muted" aria-hidden />
    </button>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-[20rem] p-4" showCloseButton>
          <DialogTitle className="sr-only">Select month and year</DialogTitle>
          {panel}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64">{panel}</PopoverContent>
    </Popover>
  );
}

/**
 * The two-step body: **month first, then year**. Picking the month alone can't
 * produce a value, so the panel advances to the year grid and only commits
 * once both halves exist — which is what keeps a half-made selection from
 * ever reaching the form.
 */
function MonthYearPanel({
  value,
  min,
  max,
  allowPresent,
  onCommit,
}: {
  value: string;
  min?: string;
  max?: string;
  allowPresent: boolean;
  onCommit: (value: string) => void;
}) {
  const [step, setStep] = useState<"month" | "year">("month");
  const [month, setMonth] = useState<number | null>(monthOf(value));

  const selectedYear = yearOf(value);
  const thisYear = new Date().getFullYear();
  const [page, setPage] = useState(() => {
    const anchor = selectedYear ?? thisYear;
    return Math.floor(anchor / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  });

  // Reopening on a different field must not inherit the last one's half-made
  // state; the parent keeps this mounted across opens.
  useEffect(() => {
    setStep("month");
    setMonth(monthOf(value));
  }, [value]);

  const minYear = min ? yearOf(min) : null;
  const maxYear = max ? yearOf(max) : null;

  /** Is any year at all selectable for this month under min/max? */
  function monthPossible(m: number): boolean {
    // A month is impossible only when every year is ruled out for it, which
    // needs both bounds inside one year.
    if (minYear === null || maxYear === null || minYear !== maxYear) {
      return true;
    }
    const lo = monthOf(min!) ?? 1;
    const hi = monthOf(max!) ?? 12;
    return m >= lo && m <= hi;
  }

  function yearAllowed(year: number, m: number): boolean {
    const candidate = `${year}-${pad(m)}`;
    if (min && candidate < min) return false;
    if (max && candidate > max) return false;
    return true;
  }

  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => page + i);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {step === "year" ? (
          <button
            type="button"
            onClick={() => setStep("month")}
            className="flex items-center gap-1 rounded-md text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {MONTHS_LONG[month! - 1]}
          </button>
        ) : (
          <p className="text-xs font-medium text-foreground">Select a month</p>
        )}

        {step === "year" ? (
          <div className="flex items-center gap-1">
            <PageButton
              label="Earlier years"
              onClick={() => setPage((p) => p - YEARS_PER_PAGE)}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </PageButton>
            <span className="w-[5.5rem] text-center font-mono text-[11px] text-muted tabular-nums">
              {page}–{page + YEARS_PER_PAGE - 1}
            </span>
            <PageButton
              label="Later years"
              onClick={() => setPage((p) => p + YEARS_PER_PAGE)}
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </PageButton>
          </div>
        ) : null}
      </div>

      {step === "month" ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, index) => {
            const m = index + 1;
            const possible = monthPossible(m);
            return (
              <GridCell
                key={label}
                selected={month === m}
                disabled={!possible}
                onClick={() => {
                  setMonth(m);
                  setStep("year");
                }}
              >
                {label}
              </GridCell>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {years.map((year) => (
            <GridCell
              key={year}
              selected={selectedYear === year && monthOf(value) === month}
              disabled={!yearAllowed(year, month!)}
              onClick={() => onCommit(`${year}-${pad(month!)}`)}
            >
              {year}
            </GridCell>
          ))}
        </div>
      )}

      {allowPresent || value ? (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="text-[11px] text-muted">
            {allowPresent ? "Leave unset for “Present”." : " "}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onCommit("")}
            className="h-7 gap-1 px-2 text-xs"
          >
            <X className="size-3" aria-hidden />
            {allowPresent ? "Present" : "Clear"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PageButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1 text-muted transition-colors duration-(--duration-fast) ease-out hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function GridCell({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-md py-1.5 text-center text-xs tabular-nums transition-colors duration-(--duration-fast) ease-out",
        selected
          ? "bg-brand text-white"
          : "text-foreground hover:bg-accent hover:text-foreground",
        "disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

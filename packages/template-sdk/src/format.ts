/**
 * Deterministic formatting shared by templates (doc 05). Purity is
 * load-bearing (doc 09): no `Date.now()`, no server locale, no randomness —
 * so the same ProfileView formats identically in the browser preview and the
 * server/PDF render, and CI can snapshot the output.
 */

const MONTHS_SHORT = [
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

/**
 * Format a calendar date (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, per doc 01) to
 * a human label. Day precision collapses to `Mon YYYY` — resumes never show a
 * day. Empty/undefined → `""`.
 */
export function formatCalendarDate(value: string | undefined | null): string {
  if (!value) {
    return "";
  }
  const [year, month] = value.split("-");
  if (!year) {
    return "";
  }
  if (!month) {
    return year;
  }
  const name = MONTHS_SHORT[Number(month) - 1];
  return name ? `${name} ${year}` : year;
}

export interface DateRangeOptions {
  /** Label for an ongoing entry (a start with no end). Default `"Present"`. */
  present?: string;
  /** Separator between the two dates. Default `" – "` (en dash). */
  separator?: string;
}

/**
 * Format a start/end pair to a range string. A start with no end reads as
 * ongoing (`"Present"`); an end with no start shows just the end. Absent both
 * → `""`. Never consults the clock — "ongoing" is a data fact, not "now".
 */
export function formatDateRange(
  start: string | undefined | null,
  end: string | undefined | null,
  options: DateRangeOptions = {},
): string {
  const present = options.present ?? "Present";
  const separator = options.separator ?? " – ";
  const from = formatCalendarDate(start);
  const to = end ? formatCalendarDate(end) : from ? present : "";

  if (from && to) {
    return `${from}${separator}${to}`;
  }
  return from || to || "";
}

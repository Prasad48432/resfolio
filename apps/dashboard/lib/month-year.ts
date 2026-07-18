/**
 * Pure bound derivation for paired month/year fields (a start and its end).
 *
 * The profile schema accepts `YYYY` | `YYYY-MM` | `YYYY-MM-DD`, and those
 * strings sort **lexicographically in date order** — so a bound is just a
 * string comparison, with no Date object and therefore no timezone able to
 * shift a value across a boundary. The picker consumes `min`/`max` directly.
 *
 * The point of computing these is that an impossible month is *unselectable*
 * rather than selectable-then-rejected: "end before start" should not be a
 * validation message the user has to read and undo.
 */

/** Normalize any accepted calendar date to the `YYYY-MM` the picker bounds on. */
export function toMonthBound(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const [, year, month] = match;
  // A bare `YYYY` start means "some time in that year", so the widest honest
  // bound is January — clamping to a month the user never chose would forbid
  // legitimate ends.
  return `${year}-${month ?? "01"}`;
}

/**
 * The `{ min, max }` a date field should enforce given its sibling's value.
 *
 * `direction: "after"` is an end date (never before its start → the sibling is
 * the floor); `"before"` is a start date (never after its end → the ceiling).
 */
export function boundsFor(
  direction: "after" | "before",
  siblingValue: unknown,
): { min?: string; max?: string } {
  const bound = toMonthBound(siblingValue);
  if (!bound) {
    return {};
  }
  return direction === "after" ? { min: bound } : { max: bound };
}

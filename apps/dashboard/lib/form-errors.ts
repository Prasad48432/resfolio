/**
 * Pure helpers over React Hook Form's error tree.
 *
 * RHF nests errors to mirror the values (`sections.experience[2].startDate`),
 * with the leaf being an object carrying `message`/`type`. Finding "the first
 * invalid field" therefore means a depth-first walk that stops at the first
 * leaf — which is exactly what the editor needs to focus after a rejected
 * save. Kept pure and out of the component so it can be unit-tested; the DOM
 * half (focus/scroll) is a one-liner at the call site.
 */

/** RHF's error tree: arbitrarily nested objects/arrays with `FieldError` leaves. */
type ErrorNode = Record<string, unknown> | unknown[];

/** An RHF leaf is the object that actually carries a message. */
function isErrorLeaf(node: unknown): node is { message?: string } {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in (node as Record<string, unknown>)
  );
}

/**
 * The dotted path of the first invalid field, in declaration order, or `null`.
 *
 * Array indices join with a dot (`sections.experience.2.startDate`) because
 * that is the shape RHF's own `setFocus`/`register` accept — bracket notation
 * would look more natural and silently fail to match.
 */
export function firstErrorPath(errors: unknown): string | null {
  function walk(node: unknown, trail: string[]): string | null {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (isErrorLeaf(node)) {
      return trail.length > 0 ? trail.join(".") : null;
    }
    for (const [key, child] of Object.entries(node as ErrorNode)) {
      // `root` is RHF's own bookkeeping key for array-level errors; it is not
      // a field anyone can focus.
      if (key === "root") {
        continue;
      }
      const found = walk(child, [...trail, key]);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return walk(errors, []);
}

/**
 * Focus the control at `path`, scrolling it into view. Returns whether one was
 * found — a caller that gets `false` should leave the save indicator to speak,
 * rather than silently doing nothing.
 *
 * Looks the element up by `name`, which every RHF-registered control carries.
 * Non-native controls (the month picker's button) opt in with `data-field`,
 * since they have no `name` attribute to find them by.
 */
export function focusField(path: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const escaped = CSS.escape(path);
  const element = document.querySelector<HTMLElement>(
    `[name="${escaped}"], [data-field="${escaped}"]`,
  );
  if (!element) {
    return false;
  }
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.focus({ preventScroll: true });
  return true;
}

"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

/**
 * Light / dark / system toggle — a client island (doc 05: portfolio renderers
 * are server-first but may layer islands; resume renderers may not, because the
 * dashboard renders those client-side for keystroke preview).
 *
 * It writes `data-theme` on the `.rf-site` root, which is what `styles.ts`'
 * palette rules key off. "System" removes the attribute and lets the
 * `prefers-color-scheme` rule apply — which is why the stylesheet defaults must
 * stand alone: until this island hydrates (or if it never does), the page is
 * already correctly light or dark. The toggle is an enhancement, not the
 * mechanism.
 *
 * The choice persists in `localStorage` under a key namespaced by the site's
 * base path, so two Resfolio sites open in one browser don't fight over it.
 */
type Choice = "light" | "dark" | "system";

const CHOICES: readonly { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function applyChoice(choice: Choice): void {
  const root = document.querySelector<HTMLElement>(".rf-site");
  if (!root) return;
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}

export function ThemeToggle({
  storageKey,
}: {
  storageKey: string;
}): ReactElement {
  const [choice, setChoice] = useState<Choice>("system");
  // Server and first client render must agree, so the button starts in its
  // neutral state and adopts the stored choice after mount. The *page* is
  // never wrong in the meantime — CSS already had it right.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setChoice(stored);
        applyChoice(stored);
      }
    } catch {
      // Private mode / blocked storage: the toggle still works for this visit.
    }
  }, [storageKey]);

  function choose(next: Choice): void {
    setChoice(next);
    applyChoice(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Ignore — see above.
    }
  }

  const current =
    CHOICES.find((entry) => entry.value === choice) ?? CHOICES[2]!;
  const nextChoice =
    CHOICES[(CHOICES.indexOf(current) + 1) % CHOICES.length] ?? CHOICES[0]!;
  const Icon = current.Icon;

  return (
    <button
      type="button"
      className="rf-icon-btn"
      onClick={() => choose(nextChoice.value)}
      // An icon-only control needs an accessible name, and a tooltip is not one.
      aria-label={
        mounted
          ? `Theme: ${current.label}. Switch to ${nextChoice.label}.`
          : "Switch theme"
      }
      title={mounted ? `Theme: ${current.label}` : undefined}
    >
      <Icon aria-hidden />
    </button>
  );
}

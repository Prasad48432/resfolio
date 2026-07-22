"use client";

import { ArrowRight, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

/**
 * ⌘K / Ctrl+K navigation — a client island (doc 05).
 *
 * Every destination it offers is an ordinary `<a href>` rendered in the page's
 * nav or body already, so this is a **shortcut, not the navigation**: if the
 * island never hydrates the site is entirely usable, which is the bar an island
 * has to clear to belong in a template.
 *
 * Items are passed in from the server renderer — the island does no data work,
 * knows nothing about the ProfileView, and never constructs a URL (routing is
 * platform-owned, doc 04).
 */
export interface PaletteItem {
  label: string;
  href: string;
  /** Secondary line — "Project", "Page", … */
  group: string;
}

export function CommandPalette({
  items,
  showHint,
}: {
  items: readonly PaletteItem[];
  showHint: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.group.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The active row must exist: filtering down to fewer results than the current
  // index would otherwise leave Enter pointing at nothing.
  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(results.length - 1, 0)));
  }, [results.length]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (value) => (value - 1 + results.length) % Math.max(results.length, 1),
      );
    } else if (event.key === "Enter") {
      const target = results[active];
      if (target) {
        event.preventDefault();
        window.location.href = target.href;
      }
    }
  }

  return (
    <>
      {showHint ? (
        <button
          type="button"
          className="rf-kbd-hint"
          onClick={() => setOpen(true)}
          aria-label="Search and jump to a page"
        >
          <Search aria-hidden style={{ width: "0.75rem", height: "0.75rem" }} />
          <span aria-hidden>⌘K</span>
        </button>
      ) : null}

      {open ? (
        <div
          className="rf-palette-backdrop"
          role="presentation"
          onClick={close}
        >
          <div
            className="rf-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Jump to"
            // Without this, a click inside the panel bubbles to the backdrop
            // and closes the thing you just clicked into.
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="rf-palette-input"
              placeholder="Jump to…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              aria-label="Jump to"
            />
            {results.length === 0 ? (
              <p className="rf-palette-empty">No matches.</p>
            ) : (
              <ul className="rf-palette-list">
                {results.map((item, index) => (
                  <li key={item.href}>
                    <a
                      className="rf-palette-item"
                      href={item.href}
                      data-active={index === active}
                      onMouseEnter={() => setActive(index)}
                    >
                      <ArrowRight aria-hidden />
                      <span className="rf-palette-label">{item.label}</span>
                      <span className="rf-label">{item.group}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

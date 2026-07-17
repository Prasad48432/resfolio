"use client";

import { X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "../lib/cn";

/**
 * A chip/tag editor for a `string[]` value — the platform's one way to edit
 * string arrays (skills, technologies). Enter is the primary commit (works on
 * every mobile keyboard); a typed or pasted comma also commits. Values are
 * trimmed, empties ignored, duplicates rejected case-insensitively. Backspace
 * in an empty input removes the last tag; every chip carries a labelled
 * remove button, so the whole component is keyboard-operable.
 *
 * Client component by necessity: the pending (uncommitted) text is internal
 * state — the parent only ever sees the committed `string[]`.
 */
export function TagInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  className,
  "data-testid": testId,
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(text: string): void {
    const additions: string[] = [];
    for (const part of text.split(",")) {
      const tag = part.trim();
      if (!tag) {
        continue;
      }
      const exists = [...value, ...additions].some(
        (existing) => existing.toLowerCase() === tag.toLowerCase(),
      );
      if (!exists) {
        additions.push(tag);
      }
    }
    if (additions.length > 0) {
      onChange([...value, ...additions]);
    }
  }

  function handleChange(next: string): void {
    // A typed (or pasted) comma commits everything before it; anything after
    // the last comma stays as the pending draft.
    if (next.includes(",")) {
      const lastComma = next.lastIndexOf(",");
      commit(next.slice(0, lastComma));
      setDraft(next.slice(lastComma + 1).trimStart());
      return;
    }
    setDraft(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      // Commit instead of submitting the enclosing form.
      event.preventDefault();
      commit(draft);
      setDraft("");
      return;
    }
    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag: string): void {
    onChange(value.filter((existing) => existing !== tag));
    inputRef.current?.focus();
  }

  return (
    // The bordered box is the control; clicking anywhere in it focuses the
    // real input, which flows inline after the chips like a continued line.
    <div
      className={cn(
        "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-sm transition-colors duration-(--duration-fast) ease-out focus-within:border-brand/50 hover:border-brand/30",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      data-testid={testId}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-surface-warm py-0.5 pr-1 pl-2 text-[13px] text-foreground"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeTag(tag);
            }}
            disabled={disabled}
            aria-label={`Remove ${tag}`}
            className="rounded-md p-0.5 text-muted transition-colors duration-(--duration-fast) ease-out hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        disabled={disabled}
        // Placeholder only while empty — once tags exist it would read as a
        // dangling instruction after the last chip.
        placeholder={value.length === 0 ? placeholder : undefined}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Don't lose typed text to a blur (tab away, autosave click).
          commit(draft);
          setDraft("");
          onBlur?.();
        }}
        enterKeyHint="enter"
        autoComplete="off"
        className="h-6 min-w-24 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/70 disabled:cursor-not-allowed"
      />
    </div>
  );
}

"use client";

import { Button, Card, Spinner } from "@resfolio/ui";
import { Check } from "lucide-react";

/**
 * One proposed change, rendered as a before/after with its own Apply button
 * (docs/architecture/13-ai-layer.md, Phases 3 and 5).
 *
 * Extracted because **two surfaces now review `ProfileChange`s** and they must
 * look identical: the chat proposes edits to the profile draft, and job tailoring
 * proposes overrides on one resume. Same guard behind both, same diff in front of
 * both — a second copy would eventually disagree about which side is the new one.
 * Only the destination and the action differ, and those are props.
 *
 * Two decisions that look like styling and are not:
 *
 * - **Every change carries its own Apply button.** A single "accept these six
 *   improvements" button is the same product as a box that writes straight into
 *   the document, with an extra click bolted on for appearances. The per-change
 *   button is the actual consent.
 * - **The diff is quiet, not red-and-green.** Nothing here is being deleted; one
 *   piece of the user's writing is being replaced by another. Colouring the old
 *   one as damage would make an ordinary rewrite read like a warning, and there
 *   are real warnings on these screens that need somewhere louder to go.
 */

/** Field names as the user knows them. Only the proposable ones need an entry —
 * anything else is already impossible by the time it reaches this component. */
const FIELD_LABELS: Record<string, string> = {
  summary: "Summary",
  description: "Description",
  highlights: "Highlights",
  technologies: "Technologies",
  skills: "Skills",
};

export function ChangeCard({
  label,
  field,
  reason,
  before,
  after,
  applied,
  pending,
  disabled,
  onApply,
  testId,
  applyTestId,
}: {
  label: string;
  field: string;
  reason: string;
  before: string | string[];
  after: string | string[];
  applied: boolean;
  pending: boolean;
  disabled: boolean;
  onApply: () => void;
  testId: string;
  applyTestId: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-3" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{label}</p>
          <p className="text-xs text-muted">{FIELD_LABELS[field] ?? field}</p>
        </div>
        {applied ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-live">
            <Check className="size-3.5" aria-hidden />
            Applied
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={onApply}
            data-testid={applyTestId}
          >
            {pending ? <Spinner size="sm" /> : null}
            Apply
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <ValueBlock tone="before" value={before} />
        <ValueBlock tone="after" value={after} />
      </div>

      {/* The reason is the model's, and it is shown as the model's — one line,
          under the diff, not framed as the platform's recommendation. */}
      <p className="text-xs text-muted italic">{reason}</p>
    </Card>
  );
}

/**
 * One side of the diff.
 *
 * The "before" is muted and the "after" carries a brand rule — direction shown
 * by weight and a marker rather than by hue, which keeps it legible for anyone
 * who cannot separate the two colours a red/green diff would rely on, and keeps
 * it from reading as an error state.
 */
function ValueBlock({
  tone,
  value,
}: {
  tone: "before" | "after";
  value: string | string[];
}) {
  const isAfter = tone === "after";
  const entries = Array.isArray(value) ? value : null;

  return (
    <div
      className={
        isAfter
          ? "border-l-2 border-brand pl-2.5 text-[13px] whitespace-pre-wrap"
          : "border-l-2 border-border pl-2.5 text-[13px] text-muted whitespace-pre-wrap"
      }
    >
      <span className="sr-only">{isAfter ? "After:" : "Before:"}</span>
      {entries ? (
        entries.length === 0 ? (
          <span className="italic">Empty</span>
        ) : (
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {entries.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )
      ) : value === "" ? (
        <span className="italic">Empty</span>
      ) : (
        value
      )}
    </div>
  );
}

"use client";

import { Button, cn } from "@resfolio/ui";
import { FileUp, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { RESUME_ACCEPT } from "@/lib/ai/resume-intake";
import { TEST_IDS } from "@/lib/testids";

/**
 * The resume drop target (docs/architecture/16-onboarding.md).
 *
 * Three things here are not decoration:
 *
 * - **The `<input type="file">` is the real control**, hidden but focusable, with
 *   the visible card as its `<label>`. That is what makes this keyboard- and
 *   screen-reader-operable for free: Tab reaches it, Space opens the picker, and
 *   the accessible name is the label's text. A `<div onClick>` that calls
 *   `input.click()` looks identical and is reachable by mouse only.
 * - **Drag state is counted, not toggled.** `dragenter`/`dragleave` fire for every
 *   descendant the pointer crosses, so a boolean flickers off the moment the
 *   cursor passes over the icon inside the zone. The depth counter is the standard
 *   fix and the bug it prevents is "the highlight strobes while I drag".
 * - **`dragover` must call `preventDefault()`**, or the browser refuses the drop
 *   and navigates to the file instead — which in this app means leaving a
 *   half-finished onboarding to render a PDF in the tab.
 *
 * It does not validate the file. `parseResumeUpload` on the server is the one
 * place the rules live, and duplicating "is it a PDF, is it under 8MB" here would
 * be a second copy to keep in agreement with it. The browser's `accept` filters
 * the picker, which is a convenience, not a check.
 */
export function ResumeDropzone({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [depth, setDepth] = useState(0);
  const dragging = depth > 0;

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDepth(0);
    const file = event.dataTransfer.files.item(0);
    if (file && !disabled) {
      onFile(file);
    }
  }

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((current) => current + 1);
      }}
      onDragLeave={() => setDepth((current) => Math.max(0, current - 1))}
      // Without this the drop never reaches `handleDrop` and the browser opens
      // the file as a navigation.
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <label
        className={cn(
          "group flex cursor-pointer flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center",
          "transition-colors duration-(--duration-press) ease-out",
          // `focus-within` rather than a ring on the label: the focus is really on
          // the input inside it, and the visible affordance has to follow the real
          // focus or the two disagree for a keyboard user.
          "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30",
          dragging
            ? "border-brand bg-brand/5"
            : "border-border hover:border-brand/50 hover:bg-surface-warm/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={RESUME_ACCEPT}
          disabled={disabled}
          className="sr-only"
          data-testid={TEST_IDS.onboardingResumeInput}
          onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) {
              onFile(file);
            }
            // Cleared so choosing the *same* file again after a failure still
            // fires `change` — a re-upload of the identical path is the most
            // likely second attempt, and without this it silently does nothing.
            event.target.value = "";
          }}
        />

        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted",
            "transition-colors duration-(--duration-press) ease-out",
            dragging
              ? "border-brand/50 text-brand"
              : "group-hover:border-brand/40 group-hover:text-brand",
          )}
          aria-hidden
        >
          {dragging ? (
            <FileUp className="size-5" />
          ) : (
            <Upload className="size-5" />
          )}
        </span>

        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {dragging ? "Drop it here" : "Drop your resume, or choose a file"}
          </span>
          <span className="text-xs text-muted">PDF, up to 8MB</span>
        </span>
      </label>

      {/* A second, explicit target for the case the label pattern serves least
          well: a touch device, where there is no drag and the dashed box does not
          read as a button. It drives the same input. */}
      <div className="mt-3 flex justify-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          data-testid={TEST_IDS.onboardingResumeBrowse}
        >
          Choose file
        </Button>
      </div>
    </div>
  );
}

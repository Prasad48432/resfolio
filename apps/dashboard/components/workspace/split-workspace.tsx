import type { ReactNode } from "react";

/**
 * The split-workspace layout primitive (docs/architecture/08-dashboard-ux.md):
 * a structured form on the left, the live renderer preview on the right —
 * "never edit blindly." Built once and reused by every editor (resume now;
 * portfolio + profile later). Fixed-ratio for V1 (resizable panes are a doc-08
 * open question); stacks below `lg` so the preview never crowds the form on a
 * laptop. The preview column sticks within the viewport as the form scrolls.
 */
export function SplitWorkspace({
  form,
  preview,
}: {
  form: ReactNode;
  preview: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]">
      <div className="min-w-0">{form}</div>
      <div className="min-w-0">
        <div className="lg:sticky lg:top-6">{preview}</div>
      </div>
    </div>
  );
}

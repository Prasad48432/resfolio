"use client";

import {
  buildProfileView,
  type Profile,
  type ViewDefinition,
} from "@resfolio/profile";
import { resolveTheme } from "@resfolio/template-sdk";
import {
  resumeClassic,
  type ResumeClassicConfig,
} from "@resfolio/template-resume-classic";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  pageCount,
  pageDimensionsPx,
  previewScale,
} from "@/lib/resume-preview";
import { TEST_IDS } from "@/lib/testids";

/**
 * The in-browser resume preview (docs/architecture/08-dashboard-ux.md,
 * 09-rendering-pipeline.md). Renders the **real** `resume-classic` component
 * (universal, zero client JS to lay out) on the profile draft — projected by
 * the same pure `buildProfileView` the print route runs, so what you see is
 * what the PDF exports. The template's physical-unit CSS makes a page a known
 * pixel box; we scale it to fit the pane and overlay advisory page-break guides.
 * Optimistic: config edits re-render instantly with no round-trip.
 */
const ResumeDocument = resumeClassic.document;

export function ResumePreview({
  profile,
  config,
  view,
}: {
  profile: Profile;
  config: ResumeClassicConfig;
  view: ViewDefinition;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);

  const profileView = useMemo(
    () => buildProfileView(profile, view),
    [profile, view],
  );
  const theme = useMemo(
    () =>
      resolveTheme(resumeClassic, {
        overrides: { "--rf-accent": config.accent },
      }),
    [config.accent],
  );

  const { widthPx, heightPx } = pageDimensionsPx(config.pageSize);

  // Fit-to-width: rescale whenever the pane resizes or the page size changes.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const measure = () => setScale(previewScale(pane.clientWidth, widthPx));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [widthPx]);

  // Track the rendered (unscaled) content height for the page-break overlay —
  // a transform on an ancestor doesn't affect the observed layout height.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const update = () => setContentHeight(page.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(page);
    return () => observer.disconnect();
  }, [profileView, config]);

  const pages = pageCount(contentHeight, heightPx);
  const footprintHeight = (contentHeight || heightPx) * scale;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={paneRef}
        data-testid={TEST_IDS.resumePreview}
        className="max-h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-border bg-[#f4f1ea] p-4"
      >
        <div
          style={{ width: widthPx * scale, height: footprintHeight }}
          className="mx-auto"
        >
          <div
            style={{
              width: widthPx,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <div
              ref={pageRef}
              style={{ position: "relative", width: widthPx }}
              className="shadow-sm"
            >
              <ResumeDocument
                view={profileView}
                config={config}
                theme={theme}
              />
              {Array.from({ length: Math.max(0, pages - 1) }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent/50"
                  style={{ top: (i + 1) * heightPx }}
                >
                  <span className="absolute right-1 top-1 rounded bg-accent/80 px-1 py-0.5 text-[9px] font-medium text-white">
                    Page {i + 2}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p
        className="text-xs text-muted"
        data-testid={TEST_IDS.resumePreviewMeta}
      >
        {config.pageSize} · {pages} page{pages > 1 ? "s" : ""} ·{" "}
        {Math.round(scale * 100)}% · live preview matches the PDF
      </p>
    </div>
  );
}

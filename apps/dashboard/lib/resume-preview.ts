import type { ResumeClassicConfig } from "@resfolio/template-resume-classic";

/**
 * Pure geometry for the in-browser resume preview
 * (docs/architecture/08-dashboard-ux.md, 02-resume-rendering.md). The resume
 * template lays out in **physical units** (mm); a browser resolves those at
 * 96dpi, so a page is a known pixel box we can scale to fit the pane and use to
 * place advisory page-break guides. No DOM here — kept pure so it unit-tests.
 */

/** CSS reference pixels per millimetre at 96dpi (1in = 25.4mm = 96px). */
export const PX_PER_MM = 96 / 25.4;

type PageSize = ResumeClassicConfig["pageSize"];

const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  LETTER: { w: 216, h: 279 },
};

export interface PageDimensions {
  widthPx: number;
  heightPx: number;
}

export function pageDimensionsPx(pageSize: PageSize): PageDimensions {
  const mm = PAGE_MM[pageSize];
  return { widthPx: mm.w * PX_PER_MM, heightPx: mm.h * PX_PER_MM };
}

/** Scale that fits a page of `pageWidthPx` into `availableWidthPx`, never
 * upscaling past 1 (a page smaller than the pane stays at natural size). */
export function previewScale(
  availableWidthPx: number,
  pageWidthPx: number,
): number {
  if (availableWidthPx <= 0 || pageWidthPx <= 0) {
    return 1;
  }
  return Math.min(1, availableWidthPx / pageWidthPx);
}

/** How many pages the content spans — advisory, for the page-break overlay. */
export function pageCount(
  contentHeightPx: number,
  pageHeightPx: number,
): number {
  if (contentHeightPx <= 0 || pageHeightPx <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(contentHeightPx / pageHeightPx));
}

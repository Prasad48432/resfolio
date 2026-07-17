import type { ExportStore } from "./export-store";

/**
 * Render a URL to a PDF through real Chromium (docs/architecture/02-resume-
 * rendering.md § "Where PDFs are generated"). Shared by the export API route
 * and the `export:pdf` script so there is exactly one implementation of the
 * cache-check → launch → `page.pdf` → store sequence.
 *
 * **Playwright is imported dynamically and stays a devDependency.** Doc 02 is
 * explicit that a serverless route is "the wrong home for a ~50MB Chromium
 * dependency" and that PDFs belong in a Trigger.dev task. A static import
 * would drag Chromium into the deployed bundle and make that decision for us.
 * So: locally the import resolves and export works end-to-end; in a deployment
 * without Playwright it throws `PdfEngineUnavailableError` and the caller
 * answers 501. That is the honest state of this seam — the task wrapper and an
 * `R2ExportStore` are the remaining cloud work, and neither changes this file's
 * callers.
 */

export class PdfEngineUnavailableError extends Error {
  constructor() {
    super("No PDF engine in this environment (Playwright is not installed).");
    this.name = "PdfEngineUnavailableError";
  }
}

export class PdfRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfRenderError";
  }
}

export interface RenderPdfOptions {
  /** Content-addressed cache key (`lib/render-key.ts`). */
  key: string;
  /** The URL Chromium loads — always a real route on this app, never
   * `setContent`: pixel parity comes from the same engine loading the same
   * page with the same self-hosted fonts (doc 02). */
  url: string;
  /** Extra request headers, e.g. the bearer for the private draft route. */
  headers?: Record<string, string>;
  store: ExportStore;
}

export interface RenderedPdf {
  bytes: Uint8Array;
  /** True when the bytes came from the store and no browser was launched. */
  cached: boolean;
}

export async function renderPdf({
  key,
  url,
  headers,
  store,
}: RenderPdfOptions): Promise<RenderedPdf> {
  const hit = await store.get(key);
  if (hit) {
    return { bytes: hit, cached: true };
  }

  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    throw new PdfEngineUnavailableError();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ extraHTTPHeaders: headers });
    const response = await page.goto(url, { waitUntil: "networkidle" });
    if (!response || !response.ok()) {
      throw new PdfRenderError(
        `Render route returned ${response?.status() ?? "no response"} for ${url}`,
      );
    }
    // `preferCSSPageSize` honours the template's own `@page { size: … }`, which
    // is how the document's pageSize config reaches the PDF (doc 02).
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    const bytes = new Uint8Array(pdf);
    await store.put(key, bytes);
    return { bytes, cached: false };
  } finally {
    await browser.close();
  }
}

import type { ExportStore } from "./export-store";

/**
 * Render a URL to a PDF through real Chromium (docs/architecture/02-resume-
 * rendering.md § "Where PDFs are generated"). Shared by the export API route
 * and the `export:pdf` script so there is exactly one implementation of the
 * cache-check → launch → `page.pdf` → store sequence.
 *
 * **Two engines behind one dynamic import, chosen by the caller.**
 * - `local` (default) uses the full `@playwright/test` browser installed for
 *   dev/CI. It stays a devDependency, so a deployment that never asks for it
 *   never bundles ~50MB of Chromium.
 * - `serverless` uses `@sparticuz/chromium` + `playwright-core`, the
 *   Lambda/Vercel-optimized Chromium that actually launches inside a serverless
 *   function. `apps/sites` picks this on Vercel (via `env.VERCEL`).
 *
 * Both are imported **dynamically**: whichever engine a deployment doesn't use
 * is never loaded, and if the chosen one is missing this throws
 * `PdfEngineUnavailableError` and the caller answers 501. The `ExportStore` and
 * this file remain the cloud seam — wrapping the route in a Trigger.dev task and
 * swapping `LocalFsExportStore` for R2 changes neither the callers nor the
 * engine code.
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

/**
 * Which Chromium to launch. `local` = the full `@playwright/test` browser
 * (dev/CI); `serverless` = `@sparticuz/chromium` + `playwright-core` (Vercel).
 */
export type PdfEngine = "local" | "serverless";

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
  /** Defaults to `local`. The export route passes `serverless` on Vercel. */
  engine?: PdfEngine;
}

/**
 * Launch the requested engine. A missing package (the `serverless` deps absent
 * locally, or the dev browser absent in a lean deployment) surfaces as
 * `PdfEngineUnavailableError` → the caller's 501, never an opaque module error.
 */
async function launchBrowser(
  engine: PdfEngine,
): Promise<import("playwright-core").Browser> {
  if (engine === "serverless") {
    let chromium;
    let playwright;
    try {
      chromium = (await import("@sparticuz/chromium")).default;
      ({ chromium: playwright } = await import("playwright-core"));
    } catch {
      throw new PdfEngineUnavailableError();
    }
    // No on-screen graphics for a print job — saves memory in the function.
    chromium.setGraphicsMode = false;
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  let launcher;
  try {
    ({ chromium: launcher } = await import("@playwright/test"));
  } catch {
    throw new PdfEngineUnavailableError();
  }
  return launcher.launch();
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
  engine = "local",
}: RenderPdfOptions): Promise<RenderedPdf> {
  const hit = await store.get(key);
  if (hit) {
    return { bytes: hit, cached: true };
  }

  const browser = await launchBrowser(engine);
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

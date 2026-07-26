import type { ExportStore } from "./export-store";

/**
 * Render a URL to a PDF through real Chromium (docs/architecture/02-resume-
 * rendering.md § "Where PDFs are generated"). Shared by the export API route
 * and the `export:pdf` script so there is exactly one implementation of the
 * cache-check → launch → `page.pdf` → store sequence.
 *
 * **Three engines, chosen by the caller.**
 * - `local` (default) uses the full `@playwright/test` browser installed for
 *   dev/CI. It stays a devDependency, so a deployment that never asks for it
 *   never bundles ~50MB of Chromium.
 * - `serverless` uses `@sparticuz/chromium` + `playwright-core`, the
 *   Lambda/Vercel-optimized Chromium that launches inside a serverless function
 *   (needs ~1.5 GB — Vercel Pro, not Hobby).
 * - `remote` launches **no browser here at all**: it POSTs the render URL +
 *   headers to the dedicated PDF microservice (`services/pdf` on Fly.io) and
 *   streams back the bytes. This is what makes export work on a 1 GB Vercel
 *   Hobby function — the heavy Chromium lives off-platform.
 *
 * `local`/`serverless` import their browser **dynamically**, so an unused engine
 * is never loaded, and a missing one throws `PdfEngineUnavailableError` (→ the
 * caller's 501). The `ExportStore` and this file remain the cloud seam: the
 * cache-check → produce → store sequence is identical across engines, so
 * swapping `LocalFsExportStore` for R2 changes neither callers nor engine code.
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
 * Which engine renders the PDF. `local` = full `@playwright/test` (dev/CI);
 * `serverless` = `@sparticuz/chromium` + `playwright-core` (Vercel Pro);
 * `remote` = offload to the `services/pdf` microservice (Vercel Hobby).
 */
export type PdfEngine = "local" | "serverless" | "remote";

/** The `remote` engine's target — the deployed PDF microservice. */
export interface PdfServiceTarget {
  /** The service's base URL (`PDF_SERVICE_URL`). */
  url: string;
  /** The server-to-server bearer the service checks (`PDF_SERVICE_SECRET`). */
  secret: string;
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
  /** Defaults to `local`. The export route picks `remote` when the PDF service
   * is configured, else `serverless` on Vercel, else `local`. */
  engine?: PdfEngine;
  /** Required when `engine === "remote"` — where to offload the render. */
  service?: PdfServiceTarget;
}

/**
 * Render via the PDF microservice: no local browser. Forwards the render URL
 * and headers (including the draft route's `RENDER_SECRET` bearer, which the
 * service replays when it loads the page) and returns the PDF bytes. The
 * service is itself bearer-guarded, so it can't be used as an open URL fetcher.
 */
async function renderViaService(
  service: PdfServiceTarget,
  url: string,
  headers: Record<string, string> | undefined,
): Promise<Uint8Array> {
  const response = await fetch(`${service.url.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${service.secret}`,
    },
    body: JSON.stringify({ url, headers: headers ?? {} }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new PdfRenderError(
      `PDF service returned ${response.status} for ${url}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
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
  service,
}: RenderPdfOptions): Promise<RenderedPdf> {
  const hit = await store.get(key);
  if (hit) {
    return { bytes: hit, cached: true };
  }

  // Off-platform render: no browser here. The cache-check above and the
  // store-write below are identical to the in-process engines — only the
  // "produce bytes" step differs.
  if (engine === "remote") {
    if (!service) {
      // The route only selects `remote` when both service vars are set, so this
      // is a programming error, not a runtime config gap.
      throw new PdfEngineUnavailableError();
    }
    const bytes = await renderViaService(service, url, headers);
    await store.put(key, bytes);
    return { bytes, cached: false };
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
    // Wait for the self-hosted web fonts to finish loading before printing.
    // `networkidle` waits for the font requests but not for them to be applied,
    // so `page.pdf()` can otherwise fire while text is laid out with fallback
    // metrics — the real glyphs then paint at the wrong advances (collapsed
    // spaces, jammed words). `document.fonts.ready` resolves once fonts are in.
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
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

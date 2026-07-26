import { createServer } from "node:http";

import { chromium } from "playwright";

/**
 * Resfolio PDF microservice.
 *
 * A deliberately tiny "URL → PDF" renderer that lives off-platform (Fly.io) so
 * `apps/sites` can offload PDF export to it instead of running Chromium inside a
 * serverless function — which is what makes export work on Vercel Hobby's 1 GB
 * limit (docs/architecture/02-resume-rendering.md).
 *
 * It is the body of `lib/pdf.ts`'s `remote` engine: `apps/sites` POSTs
 * `{ url, headers }`, the service loads that URL in Chromium (replaying the
 * headers — which carry the draft route's `RENDER_SECRET` bearer) and returns
 * `application/pdf`. It holds **no** application secrets and touches no database;
 * it only knows how to print a page it is told to load.
 *
 * Guarded by `PDF_SERVICE_SECRET` so it can't be used as an open URL fetcher.
 */
const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.PDF_SERVICE_SECRET;
const MAX_BODY_BYTES = 64 * 1024;
const NAV_TIMEOUT_MS = 45_000;

if (!SECRET || SECRET.length < 16) {
  console.error("FATAL: PDF_SERVICE_SECRET must be set (min 16 chars).");
  process.exit(1);
}

/**
 * One shared browser across requests (a launch is ~1–2s), relaunched if it ever
 * drops. Each request gets its own `context`, so nothing leaks between renders.
 */
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] })
      .catch((error) => {
        // Don't cache a failed launch — the next request should retry cleanly.
        browserPromise = null;
        throw error;
      });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("body too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function renderPdf({ url, headers }) {
  const context = await (
    await getBrowser()
  ).newContext({ extraHTTPHeaders: headers ?? {} });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: NAV_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      throw new Error(`upstream returned ${response?.status() ?? "no response"}`);
    }
    // `preferCSSPageSize` honours the template's own `@page { size: … }`, the
    // same option the in-process engines use — so output is identical whichever
    // engine `apps/sites` picks (doc 02).
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await context.close();
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }
    if (req.method !== "POST" || req.url !== "/render") {
      return json(res, 404, { ok: false, error: "not found" });
    }
    if (req.headers.authorization !== `Bearer ${SECRET}`) {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { ok: false, error: "invalid body" });
    }

    const { url, headers } = payload ?? {};
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return json(res, 400, { ok: false, error: "invalid url" });
    }
    if (
      headers != null &&
      (typeof headers !== "object" || Array.isArray(headers))
    ) {
      return json(res, 400, { ok: false, error: "invalid headers" });
    }

    const pdf = await renderPdf({ url, headers });
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": pdf.length,
    });
    res.end(pdf);
  } catch (error) {
    console.error("render failed:", error?.message ?? error);
    if (res.headersSent) {
      res.end();
    } else {
      json(res, 502, { ok: false, error: "render failed" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`pdf service listening on :${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close();
  try {
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
    }
  } catch {
    // Best-effort: we're exiting anyway.
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

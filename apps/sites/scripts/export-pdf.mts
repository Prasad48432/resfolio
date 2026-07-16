/**
 * Local resume → PDF export spike (docs/architecture/02-resume-rendering.md §
 * "Where PDFs are generated", 09-rendering-pipeline.md § Deliver). This is the
 * doc-mandated "spike the Playwright → PDF → R2 path first", minus the cloud
 * endpoints: it computes the content-hash cache key, checks the ExportStore
 * (cache hit → no Chromium boot), else mints a signed token, drives Playwright
 * over the real print route, and stores the PDF. Swapping LocalFsExportStore
 * for an R2 store and wrapping this in a Trigger.dev task is the whole
 * remaining cloud wiring.
 *
 * Usage: pnpm --filter sites export:pdf [fixtureKey]   (default: ada)
 * Requires the dev server running (pnpm --filter sites dev) and
 * PRINT_TOKEN_SECRET set to the same value in both processes.
 */
/* eslint-disable no-restricted-properties --
   Tooling script (not app runtime): it reads the print-token secret and base
   URL straight from the environment, outside the app's @resfolio/env context. */
import { join } from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";
import {
  mintRenderToken,
  type RenderTokenInput,
} from "@resfolio/document/token";
import { resumeClassic } from "@resfolio/template-resume-classic";

import { LocalFsExportStore } from "../lib/export-store.ts";
import { renderKey } from "../lib/render-key.ts";

const secret = process.env.PRINT_TOKEN_SECRET;
if (!secret) {
  console.error("Set PRINT_TOKEN_SECRET (same value the dev server uses).");
  process.exit(1);
}

const baseUrl = process.env.SITES_URL ?? "http://localhost:3002";
const fixtureKey = process.argv[2] ?? "ada";

const config = { ...resumeClassic.defaultConfig };
const input: RenderTokenInput = {
  source: "fixture",
  ref: fixtureKey,
  document: { kind: "inline", templateId: resumeClassic.id, config },
};

const store = new LocalFsExportStore(join(process.cwd(), "out"));
const key = renderKey(
  {
    source: input.source,
    ref: input.ref,
    templateId: resumeClassic.id,
    config,
    view: undefined,
  },
  resumeClassic.version,
);

if (await store.head(key)) {
  console.log(`cache hit → ${store.location(key)} (no Chromium boot)`);
  process.exit(0);
}

const token = mintRenderToken(input, secret);
const url = `${baseUrl}/render/resume/${encodeURIComponent(fixtureKey)}?token=${encodeURIComponent(token)}`;

console.log(`rendering ${fixtureKey} → PDF (key ${key})…`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response || !response.ok()) {
    throw new Error(
      `Print route returned ${response?.status() ?? "no response"} — is the dev server up and PRINT_TOKEN_SECRET matching?`,
    );
  }
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const stored = await store.put(key, new Uint8Array(pdf));
  console.log(`exported → ${stored.url}`);
} finally {
  await browser.close();
}

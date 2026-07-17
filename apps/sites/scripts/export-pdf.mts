/**
 * Local fixture → PDF export (docs/architecture/02-resume-rendering.md §
 * "Where PDFs are generated", 09-rendering-pipeline.md § Deliver). Renders a
 * repo fixture through the real template, real Chromium and real self-hosted
 * fonts — no database, no account, no secret — and stores the result under its
 * content hash. Feeds `check:ats`.
 *
 * The product's own export is `POST /api/export/resume/[documentId]` (the
 * dashboard's Download PDF button); both call the same `lib/pdf.ts`, so this
 * script and the product cannot drift. Swapping `LocalFsExportStore` for an R2
 * store and wrapping the route in a Trigger.dev task is the remaining cloud
 * wiring.
 *
 * Usage: pnpm --filter sites export:pdf [fixtureKey]   (default: ada)
 * Requires the dev server running (pnpm --filter sites dev).
 */
/* eslint-disable no-restricted-properties --
   Tooling script (not app runtime): it reads the base URL straight from the
   environment, outside the app's @resfolio/env context. */
import { join } from "node:path";
import process from "node:process";

import { resumeClassic } from "@resfolio/template-resume-classic";

import { LocalFsExportStore } from "../lib/export-store.ts";
import { renderPdf } from "../lib/pdf.ts";
import { renderKey } from "../lib/render-key.ts";

const baseUrl = process.env.SITES_URL ?? "http://localhost:3002";
const fixtureKey = process.argv[2] ?? "ada";

const config = { ...resumeClassic.defaultConfig };
const store = new LocalFsExportStore(join(process.cwd(), "out"));

const key = renderKey(
  {
    // Fixtures ship with the repo and never change — the key is a complete
    // content identity (mirrors `resolveFixtureRender`).
    revision: `fixture:${fixtureKey}`,
    templateId: resumeClassic.id,
    config,
    view: undefined,
  },
  resumeClassic.version,
);

const url = `${baseUrl}/render/resume/fixture/${encodeURIComponent(fixtureKey)}`;

console.log(`rendering ${fixtureKey} → PDF (key ${key})…`);
const { cached } = await renderPdf({ key, url, store });
console.log(
  cached
    ? `cache hit → ${store.location(key)} (no Chromium boot)`
    : `exported → ${store.location(key)}`,
);

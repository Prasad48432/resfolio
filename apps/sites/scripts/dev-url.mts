/* eslint-disable no-restricted-properties --
   Tooling script (not app runtime): reads the print-token secret straight from
   the environment, outside the app's @resfolio/env context. */
/**
 * Print a ready-to-open, signed print-route URL so you can view a resume render
 * in a browser (the route is token-guarded). Start the dev server first with
 * the same PRINT_TOKEN_SECRET.
 *
 * Fixture path (no database):
 *   pnpm --filter sites dev:url [fixtureKey]              (default: ada)
 *
 * Stored-document path (needs a real documents row + its owner's userId):
 *   pnpm --filter sites dev:url --doc <documentId> --user <userId> [--version]
 */
import process from "node:process";

import {
  mintRenderToken,
  type RenderTokenInput,
} from "@resfolio/document/token";
import { resumeClassic } from "@resfolio/template-resume-classic";

const secret = process.env.PRINT_TOKEN_SECRET;
if (!secret) {
  console.error("Set PRINT_TOKEN_SECRET (the same value the dev server uses).");
  process.exit(1);
}

const baseUrl = process.env.SITES_URL ?? "http://localhost:3002";
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const docId = flag("--doc");
let input: RenderTokenInput;
let documentId: string;

if (docId) {
  const userId = flag("--user");
  if (!userId) {
    console.error("--doc requires --user <userId> (the draft/version owner).");
    process.exit(1);
  }
  const source = args.includes("--version") ? "version" : "draft";
  input = { source, ref: userId, document: { kind: "stored", id: docId } };
  documentId = docId;
} else {
  const fixtureKey = args[0] ?? "ada";
  input = {
    source: "fixture",
    ref: fixtureKey,
    document: {
      kind: "inline",
      templateId: resumeClassic.id,
      config: { ...resumeClassic.defaultConfig },
    },
  };
  documentId = fixtureKey;
}

const token = mintRenderToken(input, secret);
console.log(
  `${baseUrl}/render/resume/${encodeURIComponent(documentId)}?token=${encodeURIComponent(token)}`,
);
console.log("\n(valid 5 minutes — re-run for a fresh link)");

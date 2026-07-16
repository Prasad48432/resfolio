import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, schema } from "@resfolio/database";
import { getOrCreateProfile, getProfile } from "@resfolio/profile/server";

import {
  certificationsCsv,
  educationCsv,
  positionsCsv,
  profileCsv,
  skillsCsv,
} from "../connectors/linkedin.fixtures";
import {
  createConnection,
  listImportReceipts,
  listPendingItems,
} from "./repository";
import { runImport } from "./import-run";
import { importItem } from "./import";

/**
 * TEMPORARY live proof (6R-4 exit criterion) — the LinkedIn export lands
 * across four Profile sections plus a suggested basics patch, against the
 * real dev database, no accounts and no network. Deleted after the run.
 */

const USER_ID = "linkedin-proof-user";

const files = {
  positions: positionsCsv,
  education: educationCsv,
  skills: skillsCsv,
  certifications: certificationsCsv,
  profile: profileCsv,
};

async function cleanup() {
  await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(schema.user).values({
    id: USER_ID,
    name: "LinkedIn Proof",
    email: "linkedin-proof@example.test",
  });
  await getOrCreateProfile(USER_ID, { name: "LinkedIn Proof" });
});

afterAll(cleanup);

describe.sequential("LinkedIn file import — the multi-section proof", () => {
  let connectionId: string;

  it("upload → one import run stages candidates across five kinds, routed", async () => {
    const connection = await createConnection(USER_ID, {
      connectorId: "linkedin",
      input: { files },
    });
    connectionId = connection.id;
    expect(connection.refreshable).toBe(false); // one-shot by declaration

    const summary = await runImport(USER_ID, connectionId);
    expect(summary.status).toBe("succeeded");
    // 2 positions (3rd has no company) + 1 education + 1 cert-safe + 1
    // cert-unsafe-url (still valid, url dropped) + 1 skills + 1 profile
    expect(summary.counts.new).toBe(7);

    const pending = await listPendingItems(USER_ID);
    const byKind = new Map<string, number>();
    for (const item of pending) {
      byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    }
    expect(byKind.get("experience")).toBe(2);
    expect(byKind.get("education")).toBe(1);
    expect(byKind.get("skillGroup")).toBe(1);
    expect(byKind.get("certification")).toBe(2);
    expect(byKind.get("profileBasics")).toBe(1);

    // Routing: every typed kind certain into its section; basics suggested.
    const basics = pending.find((item) => item.kind === "profileBasics");
    expect(basics?.route).toEqual({
      sectionKey: "basics",
      confidence: "suggested",
    });
    const experience = pending.find((item) => item.kind === "experience");
    expect(experience?.route).toEqual({
      sectionKey: "experience",
      confidence: "certain",
    });
  }, 30000);

  it("importing everything lands across four sections + patched basics, provenance stamped", async () => {
    const pending = await listPendingItems(USER_ID);
    for (const item of pending) {
      await importItem(USER_ID, item.id);
    }

    const draft = await getProfile(USER_ID);
    expect(draft.data.sections.experience).toHaveLength(2);
    expect(draft.data.sections.education).toHaveLength(1);
    expect(draft.data.sections.skills).toHaveLength(1);
    expect(draft.data.sections.certifications).toHaveLength(2);

    const senior = draft.data.sections.experience.find(
      (entry) => entry.role === "Senior Software Engineer",
    );
    expect(senior?.company).toBe("Meridian Labs");
    expect(senior?.source).toBe("linkedin");
    expect(senior?.sourceId).toContain("position:meridian-labs");
    expect(senior?.startDate).toBe("2021-03");

    expect(draft.data.sections.skills[0]?.skills).toContain("TypeScript");

    // The suggested basics patch applied on explicit import; empty fields
    // were dropped, populated ones landed.
    expect(draft.data.basics.name).toBe("Ada Lovelace");
    expect(draft.data.basics.headline).toBe("Platform engineer at heart");
    expect(draft.data.basics.location).toBe("Berlin, Germany");

    const receipts = await listImportReceipts(USER_ID);
    expect(receipts).toHaveLength(7);
    expect(receipts.every((receipt) => receipt.state === "imported")).toBe(
      true,
    );
  }, 30000);

  it("re-uploading the same export is a no-op — duplicates skipped, no second copies", async () => {
    // Same connector + identical input returns the existing connection.
    const again = await createConnection(USER_ID, {
      connectorId: "linkedin",
      input: { files },
    });
    expect(again.id).toBe(connectionId);

    const summary = await runImport(USER_ID, connectionId);
    expect(summary.status).toBe("succeeded");
    expect(summary.counts.duplicate).toBe(7);
    expect(summary.counts.new).toBe(0);

    const pending = await listPendingItems(USER_ID);
    expect(pending).toHaveLength(0);
    const draft = await getProfile(USER_ID);
    expect(draft.data.sections.experience).toHaveLength(2);
    expect(draft.data.sections.certifications).toHaveLength(2);
  }, 30000);
});

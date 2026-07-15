import { expect, test } from "@playwright/test";

import { runId, signIn } from "./helpers";

/**
 * Phase 3 exit criteria (docs/DEVELOPMENT-PLAN.md): create, edit, autosave,
 * and publish a profile end-to-end. A new user's editor is pre-seeded
 * (doc 08), autosave persists the draft across reloads, drag adds/reorders
 * sections, and Publish snapshots a version.
 */

test("new user gets a seeded, editable profile", async ({ page }) => {
  await signIn(page, "mock-google", `nova-${runId}@example.com`);

  // Seeded starter content is present (doc 08: empty states teach).
  await expect(page.getByTestId("profile-section-experience")).toBeVisible();
  await expect(page.getByTestId("profile-publish-state")).toHaveText(
    "Not published yet",
  );
});

test("edits autosave and survive a reload", async ({ page }) => {
  await signIn(page, "mock-google", `mira-${runId}@example.com`);

  const name = page.getByTestId("basics-name");
  await name.fill("Mira Okafor");

  // Indicator settles on saved once the debounce fires and the action lands.
  await expect(page.getByTestId("profile-save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );

  // The draft persisted server-side: a fresh load shows the edit.
  await page.reload();
  await expect(page.getByTestId("basics-name")).toHaveValue("Mira Okafor");
});

test("adding a section item autosaves it", async ({ page }) => {
  await signIn(page, "mock-google", `remy-${runId}@example.com`);

  await page.getByTestId("basics-name").fill("Remy");
  await page.getByTestId("profile-add-projects").click();
  // The newly added item row is visible and expanded.
  await expect(page.getByTestId("profile-item-projects-1")).toBeVisible();

  await expect(page.getByTestId("profile-save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );

  await page.reload();
  await expect(page.getByTestId("profile-item-projects-1")).toBeVisible();
});

test("publish snapshots a version", async ({ page }) => {
  await signIn(page, "mock-google", `pia-${runId}@example.com`);

  await page.getByTestId("basics-name").fill("Pia Larsen");
  await expect(page.getByTestId("profile-save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );

  await page.getByTestId("profile-publish-button").click();
  await expect(page.getByTestId("profile-publish-state")).toHaveText(
    "Published · v1",
    { timeout: 10_000 },
  );

  // A second publish creates v2.
  await page.getByTestId("basics-name").fill("Pia Larsen-Berg");
  await expect(page.getByTestId("profile-save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );
  await page.getByTestId("profile-publish-button").click();
  await expect(page.getByTestId("profile-publish-state")).toHaveText(
    "Published · v2",
    { timeout: 10_000 },
  );
});

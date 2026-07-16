import { expect, test } from "@playwright/test";

import { runId, signIn } from "./helpers";

/**
 * Phase 4 (4E/4F) exit criteria (docs/DEVELOPMENT-PLAN.md): create a resume
 * document, open its editor, and see the resume render **live** from the
 * profile draft (the in-browser preview shares `buildProfileView` + the real
 * template with the PDF path). Config edits update the preview and persist.
 */

test("create a resume, preview renders live, config persists", async ({
  page,
}) => {
  await signIn(page, "mock-google", `rhea-${runId}@example.com`);

  await page.goto("/resumes");
  // Empty state teaches before any resume exists.
  await expect(page.getByTestId("resumes-empty")).toBeVisible();

  await page.getByTestId("resume-create-button").click();

  // Lands in the editor with the live preview mounted.
  await page.waitForURL(/\/resumes\/[0-9a-f-]+$/);
  await expect(page.getByTestId("resume-editor")).toBeVisible();

  // The preview renders the seeded profile's name (identity → basics.name),
  // proving it projects the real draft through the real template.
  await expect(page.getByTestId("resume-preview")).toContainText("E2E User");

  // Changing the page size updates the optimistic preview immediately…
  // (Radix Select: open the popover, pick the option.)
  await page.getByTestId("resume-page-size").click();
  await page.getByRole("option", { name: "US Letter" }).click();
  await expect(page.getByTestId("resume-preview-meta")).toContainText("LETTER");

  // …and autosaves.
  await expect(page.getByTestId("resume-save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );

  // The document persisted: a reload restores the chosen page size.
  await page.reload();
  await expect(page.getByTestId("resume-preview-meta")).toContainText("LETTER");

  // And it now appears in the resumes list.
  await page.goto("/resumes");
  await expect(page.getByTestId("resumes-list")).toBeVisible();
});

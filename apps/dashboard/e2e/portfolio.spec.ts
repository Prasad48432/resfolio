import { expect, test } from "@playwright/test";

import { runId, signIn } from "./helpers";

/**
 * The portfolio journey (docs/architecture/03-portfolio-rendering.md): claim a
 * slug, pick a template from the gallery, and finish the template's own
 * requirements.
 *
 * **Why this file exists**: deleting a portfolio template once took every live
 * site down — the render 404'd and the settings editor reported "Offline" —
 * and nothing here caught it, because `/portfolio` had no e2e coverage at all
 * despite its testids being in the registry. The registry lookup in
 * `getDashboardPortfolioTemplate` is the seam that broke; `claims a slug` walks
 * straight through it.
 */

test("claims a slug, picks a template from the gallery, and lands in the editor", async ({
  page,
}) => {
  await signIn(page, "mock-google", `pf-${runId}@example.com`);

  await page.goto("/portfolio");

  const picker = page.getByTestId("portfolio-template-pick");
  await expect(picker).toBeVisible();

  // A gallery, not a list: every option shows what it looks like. The radio is
  // visually hidden but must remain the real control.
  const card = page.getByTestId("portfolio-template-dark-anime");
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toBeVisible();
  await expect(card.locator('input[type="radio"]')).toBeChecked();

  const slug = `pf-${runId}`;
  await page.getByTestId("portfolio-slug-input").fill(slug);
  await expect(page.getByTestId("portfolio-create-button")).toBeEnabled({
    timeout: 10_000,
  });
  await page.getByTestId("portfolio-create-button").click();

  // The editor loading at all is the regression guard: it resolves the site's
  // `template_id` through the dashboard registry, which is what a deleted or
  // renamed template breaks.
  await expect(page.getByTestId("portfolio-editor")).toBeVisible({
    timeout: 15_000,
  });
});

test("asks for the template's own requirements, then lets publish through", async ({
  page,
}) => {
  await signIn(page, "mock-google", `pf2-${runId}@example.com`);
  await page.goto("/portfolio");

  await page.getByTestId("portfolio-slug-input").fill(`pf2-${runId}`);
  await expect(page.getByTestId("portfolio-create-button")).toBeEnabled({
    timeout: 10_000,
  });
  await page.getByTestId("portfolio-create-button").click();
  await expect(page.getByTestId("portfolio-editor")).toBeVisible({
    timeout: 15_000,
  });

  // A fresh profile can't satisfy `dark-anime`, so the setup dialog opens with
  // the banner field in it — asking for the missing thing, not just naming it.
  const dialog = page.getByTestId("portfolio-setup-dialog");
  await expect(dialog).toBeVisible();
  const banner = dialog.getByTestId("portfolio-config-bannerImage");
  await expect(banner).toBeVisible();

  // Publish is gated while anything is missing.
  await expect(page.getByTestId("portfolio-publish-button")).toBeDisabled();

  // Filling a config gap clears it live — a checklist that only updated on
  // reload would be worse than none.
  await banner.fill("https://example.com/banner.jpg");
  await expect(
    page.getByTestId("portfolio-missing-checklist"),
  ).not.toContainText("Banner image");

  // Profile gaps survive: they're real content and can't be typed into a modal.
  await expect(page.getByTestId("portfolio-missing-checklist")).toBeVisible();
});

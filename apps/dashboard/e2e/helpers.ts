import { expect, type Page } from "@playwright/test";

/** Unique-per-run suffix so parallel/retried runs don't collide on emails. */
export const runId = Date.now().toString(36);

/** Drive the local mock OAuth consent screen (see mock-oauth-server.ts). */
export async function completeMockConsent(
  page: Page,
  email: string,
  name: string,
) {
  await page.waitForURL(/localhost:4780/);
  await page.fill("#mock-email", email);
  await page.fill("#mock-name", name);
  await page.click("#mock-continue");
}

/** Full sign-in through a mock provider, landing on the profile editor. */
export async function signIn(page: Page, providerId: string, email: string) {
  await page.goto("/login");
  await page.getByTestId(`login-provider-${providerId}`).click();
  await completeMockConsent(page, email, "E2E User");
  await page.waitForURL("**/profile");
  await expect(page.getByTestId("profile-editor")).toBeVisible();
}

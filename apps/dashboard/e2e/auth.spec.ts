import { expect, test } from "@playwright/test";

import { revokeAllSessions } from "./db";
import { completeMockConsent, runId, signIn } from "./helpers";

/**
 * The Phase 2 exit-criteria journeys (docs/DEVELOPMENT-PLAN.md): mocked
 * OAuth sign-in end-to-end, protected-route bouncing, account linking
 * converging on one account, and the last-provider guard.
 */

test("unauthenticated users are bounced to the login screen", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.waitForURL("**/login");
  await expect(page.getByTestId("login-page")).toBeVisible();

  await page.goto("/settings/account");
  await page.waitForURL("**/login");
});

test("signs in with mocked OAuth, keeps the session, signs out", async ({
  page,
}) => {
  const email = `ada-${runId}@example.com`;
  await signIn(page, "mock-google", email);

  // The authenticated shell is up, with the user in the sidebar menu.
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByTestId("user-menu-trigger")).toContainText(email);

  // Signed-in users skip the login screen.
  await page.goto("/login");
  await page.waitForURL("**/profile");

  // Other shell routes render.
  await page.getByTestId("nav-resumes").click();
  await page.waitForURL("**/resumes");
  await expect(page.getByTestId("top-bar-title")).toHaveText("Resumes");

  // Sign out re-locks everything.
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-sign-out").click();
  await page.waitForURL("**/login");
  await page.goto("/profile");
  await page.waitForURL("**/login");
});

test("command palette navigates with the keyboard", async ({ page }) => {
  await signIn(page, "mock-google", `kay-${runId}@example.com`);

  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("command-palette-input")).toBeVisible();
  await page.getByTestId("palette-portfolio").click();
  await page.waitForURL("**/portfolio");
});

test("linking both providers yields one account with a last-provider guard", async ({
  page,
}) => {
  const email = `linda-${runId}@example.com`;
  await signIn(page, "mock-google", email);

  await page.goto("/settings/account");
  await expect(page.getByTestId("linked-account-mock-google")).toContainText(
    "Connected",
  );
  await expect(page.getByTestId("linked-account-mock-github")).toContainText(
    "Not connected",
  );
  // Only sign-in method → unlink must be blocked.
  await expect(page.getByTestId("unlink-provider-mock-google")).toBeDisabled();

  // Link GitHub with the same verified email.
  await page.getByTestId("link-provider-mock-github").click();
  await completeMockConsent(page, email, "E2E User");
  await page.waitForURL("**/settings/account");
  await expect(page.getByTestId("linked-account-mock-github")).toContainText(
    "Connected",
  );

  // Still one account: the session user is unchanged and shows both links.
  await expect(page.getByTestId("user-menu-trigger")).toContainText(email);
  await expect(page.getByTestId("unlink-provider-mock-google")).toBeEnabled();

  // Unlink GitHub again; Google becomes the guarded last provider.
  await page.getByTestId("unlink-provider-mock-github").click();
  await expect(page.getByTestId("linked-account-mock-github")).toContainText(
    "Not connected",
  );
  await expect(page.getByTestId("unlink-provider-mock-google")).toBeDisabled();
});

test("a stale session cookie lands on the login screen, never a redirect loop", async ({
  page,
  context,
}) => {
  const email = `stale-${runId}@example.com`;
  await signIn(page, "mock-google", email);

  // Revoke server-side while the browser keeps its cookie, then expire the
  // signed cookie cache (its ~5-minute window would otherwise still vouch
  // for the session) so the next check hits the database.
  await revokeAllSessions(email);
  await context.clearCookies({ name: /session_data/ });

  // Regression guard: with a presence-only /login → app redirect in the
  // proxy this loops until ERR_TOO_MANY_REDIRECTS and locks the user out.
  await page.goto("/profile");
  await page.waitForURL("**/login");
  await expect(page.getByTestId("login-page")).toBeVisible();
});

test("signing in with the second provider lands in the same account", async ({
  page,
}) => {
  const email = `linda-${runId}@example.com`;
  // linda linked mock-github in the previous test, then unlinked it — but
  // trusted-provider linking re-converges on the same verified email.
  await signIn(page, "mock-github", email);
  await page.goto("/settings/account");
  await expect(page.getByTestId("linked-account-mock-github")).toContainText(
    "Connected",
  );
  await expect(page.getByTestId("user-menu-trigger")).toContainText(email);
});

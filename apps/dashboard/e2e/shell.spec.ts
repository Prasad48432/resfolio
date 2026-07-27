import { expect, test } from "@playwright/test";

import { queryDb } from "./db";
import { runId, signIn } from "./helpers";

/**
 * The app shell: theme switching and the collapsed icon rail
 * (docs/architecture/08-dashboard-ux.md).
 *
 * These cover the parts of the shell that are held together by CSS precedence
 * rather than by code — a mis-ordered utility or a stray `max-width` breaks
 * them silently, with nothing to typecheck and no error to read.
 */

/** The shell's styling is all utilities; if the CSS didn't load, every
 *  assertion below would still "pass" against an unstyled page. */
async function assertStyled(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('[data-slot="sidebar-header"]')!,
          ).display,
      ),
    )
    .toBe("flex");
}

test("theme switches between light, dark and system, and persists", async ({
  page,
}) => {
  await signIn(page, "mock-google", `theme-${runId}@example.com`);
  await assertStyled(page);

  const isDark = () =>
    page.evaluate(() => document.documentElement.classList.contains("dark"));
  const stored = () =>
    page.evaluate(() => localStorage.getItem("resfolio-theme"));

  const choose = async (value: "light" | "dark" | "system") => {
    const toggle = page.getByTestId("theme-toggle");
    if (!(await toggle.isVisible())) {
      await page.getByTestId("user-menu-trigger").click();
    }
    await page.getByTestId(`theme-option-${value}`).click();
  };

  await choose("dark");
  await expect.poll(isDark, "Dark applies the class").toBe(true);
  expect(await stored()).toBe("dark");

  await choose("light");
  await expect.poll(isDark, "Light removes the class").toBe(false);
  expect(await stored()).toBe("light");

  // An explicit choice must WIN over the OS — this is what would regress if
  // the `dark` variant ever fell back to `prefers-color-scheme`.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(isDark, "explicit Light beats a dark OS").toBe(false);

  // System must FOLLOW the OS, with no further interaction.
  await choose("system");
  await expect.poll(isDark, "System follows a dark OS").toBe(true);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(isDark, "System follows a light OS").toBe(false);

  // The choice survives a reload (next-themes' pre-paint script).
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await assertStyled(page);
  await expect
    .poll(isDark, "System still follows the OS after reload")
    .toBe(true);
  expect(await stored()).toBe("system");
});

const THEME_LABELS = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

test("theme toggle labels only the active option", async ({ page }) => {
  await signIn(page, "mock-google", `toggle-${runId}@example.com`);
  await assertStyled(page);
  await page.getByTestId("user-menu-trigger").click();

  for (const active of ["light", "dark", "system"] as const) {
    await page.getByTestId(`theme-option-${active}`).click();

    for (const other of ["light", "dark", "system"] as const) {
      const option = page.getByTestId(`theme-option-${other}`);
      if (other === active) {
        await expect(option, `${other} spells its label`).toHaveText(
          THEME_LABELS[other],
        );
      } else {
        await expect(option, `${other} is icon-only`).toHaveText("");
      }
      // Icon-only options still need a name for assistive tech.
      await expect(option).toHaveAttribute("aria-label", THEME_LABELS[other]);
    }
  }
});

test("collapsed rail shows the brand mark and a circular avatar", async ({
  page,
}) => {
  const email = `rail-${runId}@example.com`;
  await signIn(page, "mock-google", email);

  // The mock provider returns no picture, so force the <img> branch: the
  // fallback <span> is immune to the max-width squash the <img> hit.
  await queryDb(`UPDATE "user" SET "image" = $1 WHERE "email" = $2`, [
    "/favicon.ico",
    email,
  ]);
  // Better Auth serves the session from a signed cookie cache; drop the cached
  // payload (not the token) so the layout re-reads the user from Postgres.
  await page.context().clearCookies({ name: /session_data/ });
  await page.reload();
  await assertStyled(page);

  const avatar = page.locator('[data-testid="user-menu-trigger"] img');
  await expect(avatar, "the <img> avatar branch is under test").toHaveCount(1);

  const header = page.locator('[data-slot="sidebar-header"]');
  const wordmark = header.locator("a > span").first();
  const mark = header.locator("a > span").last();
  const chevron = page.locator('[data-testid="user-menu-trigger"] > svg');

  const box = async (l: typeof avatar) => (await l.boundingBox())!;
  const expandedHeader = await box(header);
  const expandedAvatar = await box(avatar);

  await expect(wordmark).toBeVisible();
  await expect(mark).toBeHidden();
  await expect(chevron).toBeVisible();

  await page.getByTestId("sidebar-trigger").click();
  await expect(mark, "the rail shows the brand mark").toBeVisible();

  await expect(wordmark, "wordmark hides in the rail").toBeHidden();
  await expect(chevron, "chevron hides in the rail").toBeHidden();
  await expect(
    page.locator('[data-testid="user-menu-trigger"] > span.min-w-0'),
    "identity hides in the rail",
  ).toBeHidden();

  // The sidebar animates its width, so geometry has to be polled until it
  // settles — asserting once here measures a frame mid-transition.
  await expect
    .poll(
      async () => {
        const h = await box(header);
        const m = await box(mark);
        const leftGap = m.x - h.x;
        const rightGap = h.x + h.width - (m.x + m.width);
        return Math.round(Math.abs(leftGap - rightGap));
      },
      { message: "mark is centred in the rail once the collapse settles" },
    )
    .toBeLessThanOrEqual(1);

  const collapsedHeader = await box(header);
  const collapsedAvatar = await box(avatar);

  expect(
    collapsedHeader.height,
    "header height unchanged (no layout shift)",
  ).toBe(expandedHeader.height);
  expect(collapsedAvatar.width, "avatar keeps its size").toBe(
    expandedAvatar.width,
  );
  expect(
    Math.abs(collapsedAvatar.width - collapsedAvatar.height),
    "avatar stays a perfect circle, never an ellipse",
  ).toBeLessThan(0.5);
});

/**
 * The scroll container, which is the invariant the AI chat's whole layout rests
 * on (docs/architecture/13-ai-layer.md).
 *
 * **The shell is exactly one viewport tall and the content region scrolls, not the
 * document.** Every full-height surface in the app inherits its height through
 * that chain, and the chain is four elements long — the inset, the content grid,
 * the route-transition wrapper, the page. Break any link and nothing throws:
 * `flex-1` quietly resolves against `auto`, the document grows a scrollbar, and a
 * bottom-anchored composer walks off the screen. That is precisely how it broke
 * the first time.
 *
 * Asserted on `/profile` rather than `/ai` deliberately — the chat only renders
 * with an AI provider configured, and this invariant belongs to the shell, so it
 * has to be provable on a route that always exists.
 */
test("the content region scrolls, not the document", async ({ page }) => {
  await signIn(page, "mock-google", `scroll-${runId}@example.com`);
  await assertStyled(page);

  await page.goto("/profile");
  await expect(page.getByTestId("app-content")).toBeVisible();

  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  // One pixel of tolerance for subpixel rounding; anything more means the
  // document itself has become scrollable, which is the regression.
  expect(
    doc.scrollHeight - doc.clientHeight,
    "the document must not scroll",
  ).toBeLessThanOrEqual(1);

  // And the region that replaced it is a real scroll container, with the profile
  // form long enough to prove it.
  const content = await page.getByTestId("app-content").evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    scrollable: element.scrollHeight > element.clientHeight,
  }));

  expect(content.overflowY).toBe("auto");
  expect(content.scrollable, "the content region scrolls instead").toBe(true);
});

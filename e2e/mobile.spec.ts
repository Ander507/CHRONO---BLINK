import { expect, test } from "@playwright/test";
import { launchGame, rejectConsent } from "./helpers";

test.describe("mobile", () => {
  test.beforeEach(async ({ page }) => rejectConsent(page));

  for (const route of ["/", "/games", "/play/pulse-stack", "/leaderboards", "/challenges", "/developers", "/login"]) {
    test(`${route} fits the viewport without horizontal scrolling`, async ({ page }) => {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  test("bottom navigation and touch play work", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary mobile" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Games" }).tap();
    await expect(page).toHaveURL(/\/games$/);
    await launchGame(page, "pulse-stack");
    const frame = page.frameLocator('[data-testid="game-frame"]');
    await frame.locator("canvas").first().tap();
    await expect(page.getByTestId("game-frame")).toBeVisible();
  });
});

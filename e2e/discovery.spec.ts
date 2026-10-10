import { expect, test } from "@playwright/test";
import { rejectConsent } from "./helpers";

test.describe("discovery", () => {
  test("cookie banner offers an equally easy reject", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Cookie consent" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Reject non-essential" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Cookie consent" })).toBeHidden();
  });

  test("homepage shows real games and the daily challenge", async ({ page }) => {
    await rejectConsent(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/ChronoBlink Arcade/);
    await expect(page.getByRole("region", { name: "Featured games" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CHRONO // BLINK" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "All games" })).toBeVisible();
    for (const t of ["CHRONO // BLINK", "Neon Drift", "Pulse Stack"]) {
      await expect(page.getByRole("link", { name: `Play ${t}` }).first()).toBeVisible();
    }
    await expect(page.locator("#daily-heading")).toBeVisible();
  });

  test("instant search suggestions lead to a game", async ({ page }) => {
    await rejectConsent(page);
    await page.goto("/");
    await page.keyboard.press("/");
    const box = page.getByRole("combobox", { name: "Search games" });
    await expect(box).toBeFocused();
    await box.fill("neon");
    await page.getByRole("option", { name: /Neon Drift/ }).click();
    await expect(page).toHaveURL(/\/play\/neon-drift$/);
    await expect(page.getByRole("heading", { level: 1, name: "Neon Drift" })).toBeVisible();
  });

  test("full search, catalog filters, categories and 404", async ({ page }) => {
    await rejectConsent(page);
    await page.goto("/search?q=stack");
    await expect(page.getByText(/1 game found/)).toBeVisible();
    await page.goto("/games?device=mobile&sort=az");
    await expect(page.getByRole("link", { name: "Play Pulse Stack" })).toBeVisible();
    await page.goto("/category/action");
    await expect(page.getByRole("heading", { name: "Action games" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play CHRONO // BLINK" })).toBeVisible();
    await page.goto("/category/racing");
    await expect(page.getByText("No racing games yet")).toBeVisible();
    const res = await page.goto("/play/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("This page blinked out of existence")).toBeVisible();
  });

  test("game pages have SEO metadata and structured data", async ({ page }) => {
    await rejectConsent(page);
    await page.goto("/play/chrono-blink");
    await expect(page).toHaveTitle("Play CHRONO // BLINK free online · ChronoBlink Arcade");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/play\/chrono-blink$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/media\//);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)[0]["@type"]).toBe("VideoGame");
    const sitemap = await page.request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("/play/pulse-stack");
    const robots = await page.request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /admin");
  });

  test("protected areas require sign in", async ({ page }) => {
    await rejectConsent(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    const api = await page.request.get("/api/account/export");
    expect(api.status()).toBe(401);
  });
});

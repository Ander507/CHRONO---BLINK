import { expect, test } from "@playwright/test";
import { GAME_ORIGIN, launchGame, rejectConsent } from "./helpers";

test.describe("game runtime", () => {
  test.beforeEach(async ({ page }) => rejectConsent(page));

  test("loads the original CHRONO // BLINK in an isolated sandbox", async ({ page }) => {
    const frameEl = await launchGame(page, "chrono-blink");
    await expect(frameEl).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
    const frame = page.frameLocator('[data-testid="game-frame"]');
    await expect(frame.locator("canvas#game")).toBeVisible();

    const f = page.frames().find((x) => x.url().startsWith(GAME_ORIGIN))!;
    expect(f).toBeTruthy();
    // The game can't reach the platform's DOM, cookies or storage.
    const probe = await f.evaluate(() => {
      const out: Record<string, string> = {};
      try {
        out.parent = String(window.parent.document.title);
      } catch {
        out.parent = "blocked";
      }
      try {
        out.cookie = document.cookie;
      } catch {
        out.cookie = "blocked";
      }
      try {
        localStorage.setItem("x", "1");
        out.storage = "available";
      } catch {
        out.storage = "blocked";
      }
      out.origin = window.origin;
      out.sdk = typeof (window as unknown as { ChronoBlink?: unknown }).ChronoBlink;
      return out;
    });
    expect(probe.parent).toBe("blocked");
    expect(probe.cookie === "" || probe.cookie === "blocked").toBe(true);
    expect(probe.storage).toBe("blocked");
    expect(probe.origin).toBe("null");
    expect(probe.sdk).toBe("object");
  });

  test("keyboard play never scrolls the page and the game starts a server-timed run", async ({ page }) => {
    await launchGame(page, "pulse-stack");
    await page.evaluate(() => window.scrollTo(0, 0));
    const frame = page.frameLocator('[data-testid="game-frame"]');
    await frame.locator("body").click();
    const runStart = page.waitForResponse((r) => r.url().includes("/api/play/sessions/") && r.request().postData()?.includes('"run.start"') === true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(350);
    }
    expect((await runStart).ok()).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("player controls: fullscreen, restart and mute", async ({ page }) => {
    await launchGame(page, "neon-drift");
    const viewport = page.getByTestId("game-viewport");
    await page.getByRole("button", { name: "Fullscreen" }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement) || document.documentElement.style.overflow === "hidden")).toBe(true);
    const box = await viewport.boundingBox();
    expect(box!.width).toBeGreaterThan(1300);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Exit fullscreen" }).click({ trial: true }).catch(() => {});
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.evaluate(() => document.exitFullscreen());
    await page.getByRole("button", { name: "Restart game" }).click();
    await expect(page.getByTestId("game-frame")).toHaveCSS("opacity", "1", { timeout: 30_000 });
    const mute = page.getByRole("button", { name: /^(Mute|Unmute)$/ });
    await expect(mute).toBeEnabled({ timeout: 10_000 });
    await mute.click();
    await expect(page.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the game origin rejects path traversal and unknown builds", async ({ request }) => {
    expect((await request.get(`${GAME_ORIGIN}/g/../../.env`)).status()).toBe(404);
    expect((await request.get(`${GAME_ORIGIN}/g/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/index.html`)).status()).toBe(404);
    expect((await request.get(`${GAME_ORIGIN}/p/forged.token/index.html`)).status()).toBe(403);
    expect((await request.post(`${GAME_ORIGIN}/healthz`)).status()).toBe(405);
  });

  test("runtime API rejects cross-origin and unauthenticated calls", async ({ request }) => {
    const created = await request.post("/api/play/sessions", { data: { slug: "neon-drift" }, headers: { origin: "https://evil.example" } });
    expect(created.status()).toBe(403);
    const forged = await request.post("/api/play/sessions/00000000-0000-0000-0000-000000000000", {
      data: { op: "score", leaderboard: "highscore", score: 1 },
      headers: { origin: "http://localhost:3000", "x-play-token": "nope" },
    });
    expect(forged.status()).toBe(401);
  });
});

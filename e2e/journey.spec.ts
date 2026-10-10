import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { makeZip } from "../tests/support/zip";
import { grantRole, launchGame, newIdentity, registerAndVerify, rejectConsent, signIn, signOut } from "./helpers";

/**
 * The launch acceptance path, in order:
 * player signs up → plays → earns XP/achievements → posts a score → favorites;
 * developer submits a game → admin verifies & approves → game goes live → analytics.
 */
test.describe.serial("launch journey", () => {
  const player = newIdentity("player");
  const admin = newIdentity("admin");
  const dev = newIdentity("dev");
  const slug = `e2e-orbs-${Date.now().toString(36)}`;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cb-e2e-"));

  test.beforeEach(async ({ page }) => rejectConsent(page));

  test("player signs up with email verification and signs back in", async ({ page }) => {
    await registerAndVerify(page, player);
    await signOut(page);
    // Wrong password is refused without saying which part was wrong.
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(player.username);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email/username and password don't match.")).toBeVisible();
    await signIn(page, player);
  });

  test("player plays, posts a ranked score and earns XP + achievements", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, player);
    await launchGame(page, "pulse-stack");
    const frame = page.frameLocator('[data-testid="game-frame"]');
    await frame.locator("body").click(); // starts the run
    const panel = page.locator("section", { has: page.locator("#lb-heading") });
    let posted = false;
    // Runs shorter than the board's minimum (3 s) are rejected by the server, so
    // let each run breathe before dropping slabs until the tower topples.
    for (let attempt = 0; attempt < 12 && !posted; attempt++) {
      await page.keyboard.press("Space"); // (re)start
      await page.waitForTimeout(4500);
      for (let i = 0; i < 16 && !posted; i++) {
        await page.keyboard.press("Space");
        await page.waitForTimeout(500);
        posted = (await panel.getByText(player.username).count()) > 0;
      }
      await page.waitForTimeout(800);
      posted ||= (await panel.getByText(player.username).count()) > 0;
    }
    expect(posted, "a game over should have posted a score to the leaderboard").toBe(true);
    await expect(panel.getByText(/Your best:/)).toBeVisible();

    await page.goto(`/profile/${player.username}`);
    await expect(page.getByText("Level 2")).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^On the Board/ }).first()).toBeVisible();
    await expect(page.getByText("Personal bests")).toBeVisible();
  });

  test("player saves a favorite and edits their profile", async ({ page }) => {
    await signIn(page, player);
    await page.goto("/play/neon-drift");
    await page.getByRole("button", { name: "Add Neon Drift to favorites" }).click();
    await expect(page.getByRole("button", { name: "Remove Neon Drift from favorites" })).toBeVisible();
    await page.goto("/favorites");
    await expect(page.getByRole("link", { name: "Play Neon Drift" })).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("Bio").fill("I came here to blink.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await page.goto(`/profile/${player.username}`);
    await expect(page.getByText("I came here to blink.")).toBeVisible();

    const exp = await page.request.get("/api/account/export");
    expect(exp.status()).toBe(200);
    const data = await exp.json();
    expect(data.user.email).toBe(player.email);
    expect(data.favorites).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("password");
  });

  test("regular users can't open the admin panel", async ({ page }) => {
    await signIn(page, player);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });

  test("an administrator is created with the CLI and sees platform health", async ({ page }) => {
    await registerAndVerify(page, admin);
    grantRole(admin.email, "admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Registered users")).toBeVisible();
    await page.goto("/admin/system");
    await expect(page.getByTestId("health")).toContainText("PostgreSQL");
    await expect(page.getByTestId("health")).toContainText("Game origin");
  });

  test("developer activates an account; uploads wait for studio verification", async ({ page }) => {
    await registerAndVerify(page, dev);
    await page.goto("/developers");
    await page.getByLabel("Studio or developer name").fill(`E2E Studio ${dev.username}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Activate developer account" }).click();
    await expect(page).toHaveURL(/\/developers\/dashboard/);
    await expect(page.getByText(/limited to verified studios/)).toBeVisible();
  });

  test("admin verifies the studio", async ({ page }) => {
    await signIn(page, admin);
    await page.goto("/admin/developers");
    const row = page.getByRole("row", { name: new RegExp(dev.username) });
    await row.getByRole("switch").click();
    await expect(page.getByText("Studio verified")).toBeVisible();
  });

  test("developer creates a listing, rejects a malicious build and submits a valid one", async ({ page }) => {
    await signIn(page, dev);
    await page.goto("/developers/games/new");
    await page.getByLabel("Title").fill("E2E Orb Tapper");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByLabel("Short description").fill("Tap glowing orbs as fast as you can.");
    await page.getByLabel("Full description").fill("A tiny SDK example game used by the end-to-end test suite. Tap orbs for twenty seconds.");
    await page.getByLabel("Category").selectOption({ label: "Arcade" });
    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page).toHaveURL(/\/developers\/games\/.+\/edit/);

    // Malicious archive → rejected with a reason.
    const evil = path.join(tmp, "evil.zip");
    writeFileSync(evil, makeZip([{ name: "index.html", data: "<html></html>" }, { name: "../escape.js", data: "x" }]));
    await page.getByTestId("build-input").setInputFiles(evil);
    await page.getByRole("button", { name: "Upload build" }).click();
    await expect(page.getByTestId("build-result")).toContainText("Build rejected");

    // Valid archive built from examples/sdk-starter.
    const good = path.join(tmp, "game.zip");
    writeFileSync(good, makeZip([{ name: "orb-tapper/index.html", data: readFileSync("examples/sdk-starter/index.html") }]));
    await page.getByTestId("build-input").setInputFiles(good);
    await page.getByRole("button", { name: "Upload build" }).click();
    await expect(page.getByTestId("build-result")).toContainText("Build passed validation", { timeout: 30_000 });

    // Cover art is required before submission.
    await page.locator('input[type="file"][accept^="image"]').first().setInputFiles("games/neon-drift/media/cover-landscape-1920x1080.png");
    await expect(page.getByText("Artwork uploaded")).toBeVisible();
    await page.reload();
    const v2 = page.getByTestId("version-2");
    await expect(v2.getByTestId("version-status")).toHaveText("ready");
    await v2.getByRole("button", { name: "Submit for review" }).click();
    await expect(v2.getByTestId("version-status")).toHaveText("in review");
    // Not public until approved.
    expect((await page.goto(`/play/${slug}`))?.status()).toBe(404);
  });

  test("admin approves the build and it becomes playable", async ({ page }) => {
    await signIn(page, admin);
    await page.goto("/admin/submissions");
    const card = page.getByTestId("review-card").filter({ hasText: "E2E Orb Tapper" });
    await card.getByLabel("Max pts / sec").fill("5");
    await card.getByTestId("approve").click();
    await expect(page.getByText("Approved and published")).toBeVisible();

    await launchGame(page, slug);
    // The SDK handshake completed: the platform mute control is enabled.
    await expect(page.getByRole("button", { name: /^(Mute|Unmute)$/ })).toBeEnabled({ timeout: 15_000 });
    await page.goto("/admin/audit");
    await expect(page.getByText("version.approve").first()).toBeVisible();
  });

  test("developer sees the game live with genuine analytics", async ({ page }) => {
    await signIn(page, dev);
    await page.goto("/developers/games");
    await expect(page.getByTestId("dev-games")).toContainText("published");
    await page.goto("/developers/analytics");
    await expect(page.getByText("Sessions (30d)")).toBeVisible();
    await expect(page.locator("p", { hasText: /^[1-9]\d*$/ }).first()).toBeVisible();
  });
});

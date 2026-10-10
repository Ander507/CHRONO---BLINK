import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN ?? "http://127.0.0.1:3001";

/** Pre-answers the cookie banner (necessary only) so it doesn't cover the UI. */
export async function rejectConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cb_consent", JSON.stringify({ analytics: false, ads: false, v: 1, at: Date.now() }));
  });
}

export function newIdentity(tag: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    name: `E2E ${tag}`,
    username: `e2e_${tag}_${id}`.slice(0, 24),
    email: `e2e-${tag}-${id}@example.test`,
    password: `Correct-Horse-${id}`,
  };
}
export type Identity = ReturnType<typeof newIdentity>;

/** Registers through the real form and verifies via the development mailbox. */
export async function registerAndVerify(page: Page, who: Identity) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(who.name);
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("register-success")).toBeVisible();
  await page.goto("/dev/mailbox");
  const mail = page.getByTestId("mail").filter({ hasText: who.email }).first();
  await expect(mail).toBeVisible();
  const link = await mail.getByTestId("mail-link").getAttribute("href");
  await page.goto(link!);
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole("heading", { name: /You're in/ })).toBeVisible();
}

export async function signIn(page: Page, who: Identity) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
}

/** Uses the documented CLI to grant a role (how the first admin is created). */
export function grantRole(email: string, role: "admin" | "moderator") {
  execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/set-role.ts", email, role], { stdio: "pipe" });
}

/** Starts the game on /play/[slug] and returns its frame once it's loaded. */
export async function launchGame(page: Page, slug: string) {
  await page.goto(`/play/${slug}`);
  await page.getByTestId("play-button").click();
  const frameEl = page.getByTestId("game-frame");
  await expect(frameEl).toHaveAttribute("src", new RegExp(`^${GAME_ORIGIN.replace(/[.]/g, "\\.")}/g/`));
  await expect(frameEl).toHaveCSS("opacity", "1", { timeout: 30_000 });
  return frameEl;
}

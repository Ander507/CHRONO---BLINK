import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLogs, developers, gameVersions, games, leaderboardDefinitions, user } from "@/server/db/schema";
import { GAME_META_FILE, publishedPrefix, stagingPrefix } from "@/server/game-host-policy";
import {
  activateDeveloper,
  createGame,
  createVersionUpload,
  getEditableGame,
  processVersion,
  submitForReview,
  updateGame,
  uploadPolicy,
} from "@/server/services/developer";
import { approveVersion, rejectVersion, setGameVisibility } from "@/server/services/review";
import { storage } from "@/server/services/storage";
import { VALID_INDEX, makeZip } from "../support/zip";
import { makeUser, resetDb } from "../support/fixtures";
import { categories } from "@/server/db/schema";

const listing = (slug: string, categoryId: number) => ({
  title: "Test Game",
  slug,
  shortDescription: "A short description of the test game.",
  description: "A long description of the test game that is at least forty characters long.",
  instructions: "",
  categoryId,
  tags: ["test"],
  controls: [],
  orientation: "any" as const,
  supportsDesktop: true,
  supportsMobile: false,
});

async function setup(trusted: boolean) {
  const [cat] = await db.insert(categories).values({ slug: "arcade", name: "Arcade" }).returning();
  const dev = await makeUser();
  const d = await activateDeveloper(dev, { studioName: "Test Studio" });
  if (trusted) await db.update(developers).set({ trusted: true }).where(eq(developers.id, d.id));
  const role = await db.query.user.findFirst({ where: eq(user.id, dev.id) });
  const devUser = { ...dev, role: role!.role };
  const game = await createGame(devUser, listing("test-game", cat!.id));
  return { devUser, game, cat: cat! };
}

async function uploadZip(u: Awaited<ReturnType<typeof makeUser>>, gameId: string, zip: Buffer) {
  const { versionId, upload } = await createVersionUpload(u, gameId, zip.length, "first build");
  expect(upload.url).toContain("token=");
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  await storage.put(v!.uploadKey!, zip, "application/zip"); // what the signed PUT does
  return { versionId, result: await processVersion(u, versionId) };
}

describe("developer publishing pipeline", () => {
  beforeEach(resetDb);

  it("activating promotes the user to developer and is audited", async () => {
    const { devUser } = await setup(false);
    expect(devUser.role).toBe("developer");
    const logs = await db.select().from(auditLogs);
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["developer.activate", "game.create"]));
  });

  it("restricts uploads to verified studios when no malware scanner is configured", async () => {
    const { devUser, game } = await setup(false);
    const dev = await db.query.developers.findFirst({ where: eq(developers.userId, devUser.id) });
    expect(uploadPolicy(devUser, dev!).allowed).toBe(false);
    await expect(createVersionUpload(devUser, game.id, 1000, "")).rejects.toMatchObject({ status: 403 });
  });

  it("validates, stages, reviews and publishes a build", async () => {
    const { devUser, game } = await setup(true);
    const zip = makeZip([
      { name: "index.html", data: VALID_INDEX },
      { name: "game.js", data: "console.log('hi')", deflate: true },
    ]);
    const { versionId, result } = await uploadZip(devUser, game.id, zip);
    expect(result.ok).toBe(true);
    expect(await storage.exists(`${stagingPrefix(game.id, versionId)}/index.html`)).toBe(true);
    expect(await storage.exists(`${publishedPrefix(game.id, versionId)}/index.html`)).toBe(false);

    // Not public yet, and can't be submitted without cover art.
    await expect(submitForReview(devUser, versionId)).rejects.toMatchObject({ code: "missing_cover" });
    await db.update(games).set({ coverKey: "media/x/cover.png" }).where(eq(games.id, game.id));
    await submitForReview(devUser, versionId);
    expect((await db.query.games.findFirst({ where: eq(games.id, game.id) }))?.status).toBe("in_review");

    const mod = await makeUser({ role: "moderator" });
    await approveVersion(mod, versionId, {
      notes: "Looks good",
      cspExtraOrigins: ["https://fonts.gstatic.com"],
      leaderboard: { enabled: true, maxScore: 5000, maxScorePerSecond: 50, minRunSeconds: 5 },
    });
    const g = await db.query.games.findFirst({ where: eq(games.id, game.id) });
    expect(g?.status).toBe("published");
    expect(g?.liveVersionId).toBe(versionId);
    expect(await storage.exists(`${publishedPrefix(game.id, versionId)}/index.html`)).toBe(true);
    expect(await storage.exists(`${stagingPrefix(game.id, versionId)}/index.html`)).toBe(false);
    const meta = await storage.getBuffer(`${publishedPrefix(game.id, versionId)}/${GAME_META_FILE}`, 1000);
    expect(JSON.parse(meta!.toString())).toEqual({ cspExtraOrigins: ["https://fonts.gstatic.com"] });
    const lb = await db.query.leaderboardDefinitions.findFirst({ where: eq(leaderboardDefinitions.gameId, game.id) });
    expect(lb).toMatchObject({ verification: "provisional", maxScorePerSecond: 50 });

    // A second approval of the same build is refused.
    await expect(approveVersion(mod, versionId, { notes: "", cspExtraOrigins: [], leaderboard: { enabled: false, maxScore: 1, maxScorePerSecond: 1, minRunSeconds: 1 } })).rejects.toMatchObject({ status: 409 });

    // Removal deletes public files but keeps history.
    const admin = await makeUser({ role: "admin" });
    await setGameVisibility(admin, game.id, "removed", "test");
    expect(await storage.exists(`${publishedPrefix(game.id, versionId)}/index.html`)).toBe(false);
    expect((await db.query.games.findFirst({ where: eq(games.id, game.id) }))?.status).toBe("removed");
  });

  it("rejects malicious archives and keeps nothing staged", async () => {
    const { devUser, game } = await setup(true);
    const evil = makeZip([
      { name: "index.html", data: VALID_INDEX },
      { name: "../../escape.js", data: "x" },
    ]);
    const { versionId, result } = await uploadZip(devUser, game.id, evil);
    expect(result.ok).toBe(false);
    const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
    expect(v?.status).toBe("invalid");
    expect(await storage.list(stagingPrefix(game.id, versionId))).toEqual([]);
    await expect(submitForReview(devUser, versionId)).rejects.toMatchObject({ status: 409 });
  });

  it("requires review notes to reject and returns the game to the developer", async () => {
    const { devUser, game } = await setup(true);
    const { versionId } = await uploadZip(devUser, game.id, makeZip([{ name: "index.html", data: VALID_INDEX }]));
    await db.update(games).set({ coverKey: "media/x/c.png" }).where(eq(games.id, game.id));
    await submitForReview(devUser, versionId);
    const mod = await makeUser({ role: "moderator" });
    await expect(rejectVersion(mod, versionId, "")).rejects.toMatchObject({ status: 400 });
    await rejectVersion(mod, versionId, "Please add a title screen");
    expect((await db.query.games.findFirst({ where: eq(games.id, game.id) }))?.status).toBe("rejected");
    expect((await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) }))?.reviewNotes).toBe("Please add a title screen");
  });

  it("prevents developers from touching other developers' games (IDOR)", async () => {
    const { game, cat } = await setup(true);
    const other = await makeUser();
    await activateDeveloper(other, { studioName: "Other" });
    const otherUser = { ...other, role: "developer" as const };
    await expect(getEditableGame(otherUser, game.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateGame(otherUser, game.id, listing("hijack", cat.id))).rejects.toMatchObject({ status: 404 });
    await expect(createVersionUpload(otherUser, game.id, 100, "")).rejects.toMatchObject({ status: 404 });
  });

  it("enforces the upload size quota", async () => {
    const { devUser, game } = await setup(true);
    await expect(createVersionUpload(devUser, game.id, 500 * 1024 * 1024, "")).rejects.toMatchObject({ status: 413 });
  });
});

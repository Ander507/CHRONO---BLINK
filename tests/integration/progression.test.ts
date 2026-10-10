import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { challengeDefinitions, challengeProgress, cloudSaves, games, profiles, user, xpTransactions } from "@/server/db/schema";
import { XP_RULES } from "@/lib/progression";
import { applyChallengeSignal, ensureDailyChallenge } from "@/server/services/challenges";
import { getPlayerStanding, getTopScores } from "@/server/services/leaderboards";
import { authorizeSession, createPlaySession, importGuestSaves, saveCloud, loadCloud, startRun, endRun, submitScore } from "@/server/services/play";
import { grantXp } from "@/server/services/progression";
import { invalidate } from "@/server/cache";
import { ageRun, makeGame, makeUser, resetDb, today } from "../support/fixtures";

describe("XP", () => {
  beforeEach(resetDb);

  it("is idempotent per source key", async () => {
    const u = await makeUser();
    expect(await grantXp(db, u.id, 40, "achievement", "achievement:1")).toBe(40);
    expect(await grantXp(db, u.id, 40, "achievement", "achievement:1")).toBe(0);
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(p?.xpTotal).toBe(40);
  });

  it("caps repeatable activity per UTC day but not one-off rewards", async () => {
    const u = await makeUser();
    let granted = 0;
    for (let i = 0; i < 30; i++) granted += await grantXp(db, u.id, 10, "scored_run", `run:${i}`);
    expect(granted).toBe(XP_RULES.dailyActivityCap);
    expect(await grantXp(db, u.id, 100, "daily_challenge", "challenge:1")).toBe(100);
    const rows = await db.select().from(xpTransactions).where(eq(xpTransactions.userId, u.id));
    expect(rows.every((r) => r.day === today())).toBe(true);
  });
});

describe("daily challenges", () => {
  beforeEach(resetDb);

  it("are generated deterministically, only from published games", async () => {
    expect(await ensureDailyChallenge("2026-01-01")).toBeNull();
    const { game } = await makeGame();
    const hidden = await makeGame();
    await db.update(games).set({ status: "unlisted" }).where(eq(games.id, hidden.game.id));
    await db.insert(challengeDefinitions).values([
      { gameId: game.id, type: "score_at_least", leaderboardKey: "highscore", targets: [100, 200], titleTemplate: "Score {target}", rewardXp: 100 },
      { gameId: hidden.game.id, type: "runs_completed", targets: [3], titleTemplate: "Finish {target}", rewardXp: 50 },
    ]);
    const a = await ensureDailyChallenge("2026-03-04");
    const b = await ensureDailyChallenge("2026-03-04");
    expect(a?.id).toBe(b?.id);
    expect(a?.gameId).toBe(game.id);
    expect(a?.startsAt.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    expect(a?.endsAt.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(a?.title).toMatch(/^Score (100|200)$/);
  });

  it("complete once and reward once", async () => {
    const { game } = await makeGame();
    await db.insert(challengeDefinitions).values({ gameId: game.id, type: "score_at_least", leaderboardKey: "highscore", targets: [100], titleTemplate: "Score {target}", rewardXp: 100 });
    const c = await ensureDailyChallenge(today());
    const u = await makeUser();
    expect(await applyChallengeSignal(db, u.id, { kind: "score", gameId: game.id, leaderboardKey: "highscore", score: 40 })).toMatchObject({ completed: false, progress: 40 });
    expect(await applyChallengeSignal(db, u.id, { kind: "score", gameId: game.id, leaderboardKey: "highscore", score: 150 })).toMatchObject({ completed: true, justCompleted: true });
    expect(await applyChallengeSignal(db, u.id, { kind: "score", gameId: game.id, leaderboardKey: "highscore", score: 300 })).toMatchObject({ completed: true, justCompleted: false });
    const xp = await db.select().from(xpTransactions).where(eq(xpTransactions.userId, u.id));
    expect(xp.filter((x) => x.reason === "daily_challenge")).toHaveLength(1);
    const prog = await db.query.challengeProgress.findFirst({ where: eq(challengeProgress.challengeId, c!.id) });
    expect(prog?.progress).toBe(300);
  });

  it("ignore signals from other games", async () => {
    const { game } = await makeGame();
    const other = await makeGame();
    await db.insert(challengeDefinitions).values({ gameId: game.id, type: "runs_completed", targets: [2], titleTemplate: "Finish {target}", rewardXp: 60 });
    await ensureDailyChallenge(today());
    const u = await makeUser();
    expect(await applyChallengeSignal(db, u.id, { kind: "run_completed", gameId: other.game.id, runSeconds: 30 })).toBeNull();
  });
});

describe("leaderboards", () => {
  beforeEach(resetDb);

  async function post(slug: string, u: Awaited<ReturnType<typeof makeUser>>, score: number) {
    const s = await createPlaySession({ gameSlug: slug, user: u, anonId: null, device: "desktop" });
    const row = await authorizeSession(s.sessionId, s.token, u);
    const { runId } = await startRun(row);
    await ageRun(runId, 60);
    await endRun(row);
    return submitScore(row, { leaderboard: "highscore", score });
  }

  it("keep each player's best, exclude banned players and compute standing", async () => {
    const { game, leaderboard } = await makeGame({ maxScorePerSecond: 1000 });
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    await post(game.slug, a, 100);
    await post(game.slug, a, 900);
    await post(game.slug, b, 500);
    await post(game.slug, c, 5000);
    await db.update(user).set({ banned: true }).where(eq(user.id, c.id));
    invalidate("lb:");
    const top = await getTopScores(leaderboard.id, "all", 10);
    expect(top.map((r) => [r.userId, r.score])).toEqual([
      [a.id, 900],
      [b.id, 500],
    ]);
    expect(await getPlayerStanding(leaderboard.id, b.id, "all")).toEqual({ best: 500, rank: 2 });
    expect(await getTopScores(leaderboard.id, "daily", 10)).toHaveLength(2);
  });
});

describe("cloud saves", () => {
  beforeEach(resetDb);

  it("enforce size and key limits and refuse guests", async () => {
    const { game } = await makeGame();
    const u = await makeUser();
    const s = await createPlaySession({ gameSlug: game.slug, user: u, anonId: null, device: "desktop" });
    const row = await authorizeSession(s.sessionId, s.token, u);
    await saveCloud(row, "progress", { level: 3 });
    expect(await loadCloud(row, "progress")).toEqual({ value: { level: 3 } });
    await expect(saveCloud(row, "big", "x".repeat(17 * 1024))).rejects.toMatchObject({ status: 413 });
    for (let i = 0; i < 31; i++) await saveCloud(row, `k${i}`, i);
    await expect(saveCloud(row, "one-too-many", 1)).rejects.toMatchObject({ status: 409 });
    await saveCloud(row, "progress", { level: 4 }); // overwriting an existing key is fine

    const g = await createPlaySession({ gameSlug: game.slug, user: null, anonId: null, device: "desktop" });
    const guest = await authorizeSession(g.sessionId, g.token, null);
    await expect(saveCloud(guest, "progress", 1)).rejects.toMatchObject({ status: 403 });
  });

  it("guest import never overwrites cloud data", async () => {
    const { game } = await makeGame();
    const u = await makeUser();
    await db.insert(cloudSaves).values({ userId: u.id, gameId: game.id, key: "progress", data: { level: 9 }, bytes: 11 });
    const n = await importGuestSaves(u.id, [
      { gameSlug: game.slug, key: "progress", value: { level: 1 } },
      { gameSlug: game.slug, key: "settings", value: { muted: true } },
      { gameSlug: "missing-game", key: "x", value: 1 },
    ]);
    expect(n).toBe(1);
    const rows = await db.select().from(cloudSaves).where(eq(cloudSaves.userId, u.id));
    expect(rows.find((r) => r.key === "progress")?.data).toEqual({ level: 9 });
  });
});

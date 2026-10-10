import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { achievementUnlocks, achievements, gameRuns, gameSessions, gameplayEvents, leaderboardEntries, profiles, xpTransactions } from "@/server/db/schema";
import {
  authorizeSession,
  createPlaySession,
  endRun,
  heartbeat,
  startRun,
  submitScore,
  unlockGameAchievement,
} from "@/server/services/play";
import { XP_RULES } from "@/lib/progression";
import { ageRun, makeGame, makeUser, resetDb } from "../support/fixtures";

async function seedPlatformAchievements() {
  await db.insert(achievements).values([
    { key: "first_game", title: "First Game Played", description: "x", xp: 25, rule: { type: "runs_completed", count: 1 } },
    { key: "first_high_score", title: "On the Board", description: "x", xp: 25, rule: { type: "first_leaderboard_entry" } },
  ]);
}

async function session(gameSlug: string, user: Awaited<ReturnType<typeof makeUser>> | null) {
  const s = await createPlaySession({ gameSlug, user, anonId: null, device: "desktop" });
  return { ...s, row: await authorizeSession(s.sessionId, s.token, user) };
}

describe("play sessions", () => {
  beforeEach(resetDb);

  it("only starts sessions for published games with a live build", async () => {
    await expect(createPlaySession({ gameSlug: "nope", user: null, anonId: null, device: "desktop" })).rejects.toMatchObject({ status: 404 });
    const { game } = await makeGame();
    const s = await createPlaySession({ gameSlug: game.slug, user: null, anonId: null, device: "mobile" });
    expect(s.token.length).toBeGreaterThan(30);
    const row = await db.query.gameSessions.findFirst({ where: eq(gameSessions.id, s.sessionId) });
    expect(row?.tokenHash).not.toContain(s.token); // only a hash is stored
  });

  it("authorizes by bearer token and by owner", async () => {
    const { game } = await makeGame();
    const alice = await makeUser();
    const bob = await makeUser();
    const s = await createPlaySession({ gameSlug: game.slug, user: alice, anonId: null, device: "desktop" });
    await expect(authorizeSession(s.sessionId, "wrong", alice)).rejects.toMatchObject({ status: 401 });
    await expect(authorizeSession(s.sessionId, s.token, bob)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeSession(s.sessionId, s.token, null)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeSession(s.sessionId, s.token, alice)).resolves.toMatchObject({ id: s.sessionId });
  });

  it("clamps reported active time to the wall clock", async () => {
    const { game } = await makeGame();
    const { row } = await session(game.slug, null);
    const r = await heartbeat(row, { activeSeconds: 600, loadState: "loaded", loadMs: 1234 });
    expect(r.counted).toBeLessThanOrEqual(3);
    const after = await db.query.gameSessions.findFirst({ where: eq(gameSessions.id, row.id) });
    expect(after?.loadState).toBe("loaded");
    expect(after?.loadMs).toBe(1234);
  });
});

describe("score submission", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlatformAchievements();
  });

  it("asks guests to sign in", async () => {
    const { game } = await makeGame();
    const { row } = await session(game.slug, null);
    await startRun(row);
    expect(await submitScore(row, { leaderboard: "highscore", score: 10 })).toMatchObject({ accepted: false, reason: "guest" });
  });

  it("rejects unknown boards and scores without a run", async () => {
    const { game } = await makeGame();
    const u = await makeUser();
    const { row } = await session(game.slug, u);
    expect(await submitScore(row, { leaderboard: "nope", score: 1 })).toMatchObject({ reason: "unknown_leaderboard" });
    expect(await submitScore(row, { leaderboard: "highscore", score: 1 })).toMatchObject({ reason: "no_run" });
  });

  it("enforces minimum run length and the per-second plausibility ceiling", async () => {
    const { game } = await makeGame({ maxScorePerSecond: 100, minRunSeconds: 3 });
    const u = await makeUser();
    const { row } = await session(game.slug, u);

    await startRun(row); // fresh run → too short
    expect(await submitScore(row, { leaderboard: "highscore", score: 1 })).toMatchObject({ accepted: false, reason: "rejected" });

    const { runId } = await startRun(row);
    await ageRun(runId, 20);
    await endRun(row);
    // 20 s × 100/s = 2,000 ceiling
    expect(await submitScore(row, { leaderboard: "highscore", score: 50_000 })).toMatchObject({ accepted: false, reason: "rejected" });
    const rejected = await db.select().from(gameplayEvents).where(eq(gameplayEvents.name, "score_rejected"));
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    expect(String(rejected.at(-1)?.props.reasons)).toContain("above_rate_ceiling");
  });

  it("accepts a valid score once per run, ranks it, and grants XP and achievements idempotently", async () => {
    const { game } = await makeGame({ maxScorePerSecond: 100 });
    const u = await makeUser();
    const { row } = await session(game.slug, u);
    const { runId } = await startRun(row);
    await ageRun(runId, 30);
    await endRun(row);

    const r = await submitScore(row, { leaderboard: "highscore", score: 1500 });
    expect(r).toMatchObject({ accepted: true, provisional: true, best: 1500, rank: 1 });
    // replay of the same run is refused
    expect(await submitScore(row, { leaderboard: "highscore", score: 1500 })).toMatchObject({ accepted: false });
    expect(await db.select().from(leaderboardEntries)).toHaveLength(1);

    const xp = await db.select().from(xpTransactions).where(eq(xpTransactions.userId, u.id));
    const reasons = xp.map((x) => x.reason).sort();
    expect(reasons).toEqual(["achievement", "achievement", "daily_first_play", "scored_run"]);
    const total = xp.reduce((n, x) => n + x.amount, 0);
    expect(total).toBe(XP_RULES.scoredRun + XP_RULES.dailyFirstPlay + 50);
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(p?.xpTotal).toBe(total);
    expect(p?.level).toBe(2);
    const unlocked = await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.userId, u.id));
    expect(unlocked).toHaveLength(2);
  });

  it("ranks players against each other", async () => {
    const { game } = await makeGame({ maxScorePerSecond: 1000 });
    const scores = [500, 2500, 1500];
    const results = [];
    for (const score of scores) {
      const u = await makeUser();
      const { row } = await session(game.slug, u);
      const { runId } = await startRun(row);
      await ageRun(runId, 30);
      await endRun(row);
      results.push(await submitScore(row, { leaderboard: "highscore", score }));
    }
    expect(results.map((r) => r.rank)).toEqual([1, 1, 2]);
  });

  it("doesn't count very short runs as completed", async () => {
    const { game } = await makeGame();
    const u = await makeUser();
    const { row } = await session(game.slug, u);
    await startRun(row);
    await endRun(row);
    const xp = await db.select().from(xpTransactions).where(eq(xpTransactions.userId, u.id));
    expect(xp).toHaveLength(0);
    const runs = await db.select().from(gameRuns).where(eq(gameRuns.sessionId, row.id));
    expect(runs[0]?.endedAt).not.toBeNull();
  });
});

describe("game-reported achievements", () => {
  beforeEach(resetDb);

  it("require a matching definition, a signed-in player and a long enough run", async () => {
    const { game } = await makeGame();
    await db.insert(achievements).values({ gameId: game.id, key: "survive_60", title: "x", description: "x", xp: 30, rule: { type: "game_reported", minRunSeconds: 55 } });
    const u = await makeUser();
    const { row } = await session(game.slug, u);
    expect(await unlockGameAchievement(row, "not_defined")).toEqual({ unlocked: false });
    const { runId } = await startRun(row);
    expect(await unlockGameAchievement(row, "survive_60")).toEqual({ unlocked: false });
    await ageRun(runId, 60);
    expect(await unlockGameAchievement(row, "survive_60")).toEqual({ unlocked: true });
    expect(await unlockGameAchievement(row, "survive_60")).toEqual({ unlocked: true });
    const xp = await db.select().from(xpTransactions).where(and(eq(xpTransactions.userId, u.id), eq(xpTransactions.reason, "game_achievement")));
    expect(xp).toHaveLength(1);

    const guest = await session(game.slug, null);
    expect(await unlockGameAchievement(guest.row, "survive_60")).toEqual({ unlocked: false });
  });
});

import "server-only";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import { challengeDefinitions, challengeProgress, dailyChallenges, games } from "@/server/db/schema";
import { utcDay } from "@/lib/utils";
import { grantXp } from "@/server/services/progression";

type Executor = Tx | typeof db;

/** FNV-1a — stable across processes so every instance picks the same challenge. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Returns the challenge for a UTC day, creating it on first access. Only
 * definitions whose game is currently published are eligible, so the
 * challenge is always playable. Deterministic per day; the unique index on
 * `day` makes concurrent creation safe.
 */
export async function ensureDailyChallenge(day = utcDay()) {
  const existing = await db.query.dailyChallenges.findFirst({ where: eq(dailyChallenges.day, day) });
  if (existing) return existing;

  const defs = await db
    .select({ d: challengeDefinitions })
    .from(challengeDefinitions)
    .innerJoin(games, eq(games.id, challengeDefinitions.gameId))
    .where(and(eq(challengeDefinitions.active, true), eq(games.status, "published"), isNotNull(games.liveVersionId)))
    .orderBy(challengeDefinitions.id);
  if (defs.length === 0) return null;

  const pick = defs[hash(`def:${day}`) % defs.length]!.d;
  if (pick.targets.length === 0) return null;
  const target = pick.targets[hash(`target:${day}`) % pick.targets.length]!;
  const startsAt = new Date(`${day}T00:00:00.000Z`);
  const endsAt = new Date(startsAt.getTime() + 86_400_000);
  await db
    .insert(dailyChallenges)
    .values({
      day,
      definitionId: pick.id,
      gameId: pick.gameId,
      type: pick.type,
      leaderboardKey: pick.leaderboardKey,
      target,
      title: pick.titleTemplate.replaceAll("{target}", target.toLocaleString("en-US")),
      rewardXp: pick.rewardXp,
      startsAt,
      endsAt,
    })
    .onConflictDoNothing();
  return (await db.query.dailyChallenges.findFirst({ where: eq(dailyChallenges.day, day) })) ?? null;
}

export async function getTodayChallenge() {
  const c = await ensureDailyChallenge();
  if (!c) return null;
  const game = await db.query.games.findFirst({
    where: eq(games.id, c.gameId),
    columns: { id: true, slug: true, title: true, coverKey: true, accentColor: true },
  });
  return game ? { ...c, game } : null;
}

export async function getChallengeProgress(userId: string, challengeId: number) {
  return db.query.challengeProgress.findFirst({
    where: and(eq(challengeProgress.userId, userId), eq(challengeProgress.challengeId, challengeId)),
  });
}

export async function getChallengeHistory(userId: string, limit = 14) {
  return db
    .select({
      id: dailyChallenges.id,
      day: dailyChallenges.day,
      title: dailyChallenges.title,
      type: dailyChallenges.type,
      target: dailyChallenges.target,
      rewardXp: dailyChallenges.rewardXp,
      progress: challengeProgress.progress,
      completedAt: challengeProgress.completedAt,
      gameSlug: games.slug,
      gameTitle: games.title,
    })
    .from(dailyChallenges)
    .innerJoin(games, eq(games.id, dailyChallenges.gameId))
    .leftJoin(challengeProgress, and(eq(challengeProgress.challengeId, dailyChallenges.id), eq(challengeProgress.userId, userId)))
    .where(lt(dailyChallenges.day, utcDay()))
    .orderBy(desc(dailyChallenges.day))
    .limit(limit);
}

export type ChallengeSignal =
  | { kind: "score"; gameId: string; leaderboardKey: string; score: number }
  | { kind: "run_completed"; gameId: string; runSeconds: number };

/**
 * Applies a server-verified gameplay signal to today's challenge. Completion is
 * a conditional update (completed_at is null) so the reward is granted at most
 * once, and grantXp is idempotent on top of that.
 */
export async function applyChallengeSignal(tx: Executor, userId: string, signal: ChallengeSignal) {
  const day = utcDay();
  const c = await tx.query.dailyChallenges.findFirst({ where: eq(dailyChallenges.day, day) });
  if (!c || c.gameId !== signal.gameId) return null;
  const now = new Date();
  if (now < c.startsAt || now >= c.endsAt) return null;

  let value: number | null = null;
  let mode: "max" | "add" = "max";
  if (c.type === "score_at_least" && signal.kind === "score" && signal.leaderboardKey === (c.leaderboardKey ?? "highscore")) {
    value = signal.score;
  } else if (c.type === "run_seconds_at_least" && signal.kind === "run_completed") {
    value = Math.floor(signal.runSeconds);
  } else if (c.type === "runs_completed" && signal.kind === "run_completed") {
    value = 1;
    mode = "add";
  }
  if (value === null) return null;

  const progressExpr =
    mode === "add" ? sql`${challengeProgress.progress} + ${value}` : sql`greatest(${challengeProgress.progress}, ${value})`;
  const [row] = await tx
    .insert(challengeProgress)
    .values({ userId, challengeId: c.id, progress: value })
    .onConflictDoUpdate({
      target: [challengeProgress.userId, challengeProgress.challengeId],
      set: { progress: progressExpr },
    })
    .returning();
  if (!row || row.progress < c.target) return { challengeId: c.id, completed: false, progress: row?.progress ?? 0 };

  const completed = await tx
    .update(challengeProgress)
    .set({ completedAt: now })
    .where(
      and(eq(challengeProgress.userId, userId), eq(challengeProgress.challengeId, c.id), isNull(challengeProgress.completedAt)),
    )
    .returning();
  if (completed.length > 0) await grantXp(tx, userId, c.rewardXp, "daily_challenge", `challenge:${c.id}`);
  return { challengeId: c.id, completed: true, justCompleted: completed.length > 0, progress: row.progress };
}

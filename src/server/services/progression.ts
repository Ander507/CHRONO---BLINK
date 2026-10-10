import "server-only";
import { and, count, countDistinct, eq, gte, inArray, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import {
  achievementUnlocks,
  achievements,
  challengeProgress,
  gameRuns,
  leaderboardDefinitions,
  leaderboardEntries,
  profiles,
  xpTransactions,
  type AchievementRule,
} from "@/server/db/schema";
import { CAPPED_REASONS, XP_RULES, levelForXp } from "@/lib/progression";
import { utcDay } from "@/lib/utils";

type Executor = Tx | typeof db;

/**
 * Grants XP idempotently. `sourceKey` identifies the thing being rewarded
 * (a run, an achievement, a challenge…) so retries never double-grant.
 * Repeatable activity is clamped to the daily cap.
 */
export async function grantXp(
  tx: Executor,
  userId: string,
  amount: number,
  reason: string,
  sourceKey: string,
): Promise<number> {
  if (amount <= 0) return 0;
  const day = utcDay();
  let grant = amount;
  if ((CAPPED_REASONS as readonly string[]).includes(reason)) {
    const [row] = await tx
      .select({ total: sum(xpTransactions.amount) })
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, userId), eq(xpTransactions.day, day), inArray(xpTransactions.reason, [...CAPPED_REASONS])));
    const used = Number(row?.total ?? 0);
    grant = Math.max(0, Math.min(amount, XP_RULES.dailyActivityCap - used));
    if (grant === 0) return 0;
  }
  const inserted = await tx
    .insert(xpTransactions)
    .values({ userId, amount: grant, reason, sourceKey, day })
    .onConflictDoNothing()
    .returning({ id: xpTransactions.id });
  if (inserted.length === 0) return 0;
  const [p] = await tx
    .insert(profiles)
    .values({ userId, xpTotal: grant, level: levelForXp(grant) })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { xpTotal: sql`${profiles.xpTotal} + ${grant}` },
    })
    .returning({ xpTotal: profiles.xpTotal });
  if (p) await tx.update(profiles).set({ level: levelForXp(p.xpTotal) }).where(eq(profiles.userId, userId));
  return grant;
}

export type UserStats = {
  runsCompleted: number;
  distinctGames: number;
  distinctDays: number;
  hasLeaderboardEntry: boolean;
  challengesCompleted: number;
  level: number;
  xp: number;
};

export async function getUserStats(tx: Executor, userId: string): Promise<UserStats> {
  const completed = and(
    eq(gameRuns.userId, userId),
    isNotNull(gameRuns.endedAt),
    sql`extract(epoch from (${gameRuns.endedAt} - ${gameRuns.startedAt})) >= ${XP_RULES.completedRunSeconds}`,
  );
  const [runs] = await tx
    .select({
      runs: count(),
      games: countDistinct(gameRuns.gameId),
      days: sql<number>`count(distinct (${gameRuns.startedAt} at time zone 'UTC')::date)`,
    })
    .from(gameRuns)
    .where(completed);
  const [lb] = await tx.select({ n: count() }).from(leaderboardEntries).where(eq(leaderboardEntries.userId, userId));
  const [ch] = await tx
    .select({ n: count() })
    .from(challengeProgress)
    .where(and(eq(challengeProgress.userId, userId), isNotNull(challengeProgress.completedAt)));
  const [p] = await tx.select({ xp: profiles.xpTotal, level: profiles.level }).from(profiles).where(eq(profiles.userId, userId));
  return {
    runsCompleted: Number(runs?.runs ?? 0),
    distinctGames: Number(runs?.games ?? 0),
    distinctDays: Number(runs?.days ?? 0),
    hasLeaderboardEntry: Number(lb?.n ?? 0) > 0,
    challengesCompleted: Number(ch?.n ?? 0),
    level: p?.level ?? 1,
    xp: p?.xp ?? 0,
  };
}

/** Progress toward a rule as [current, target]. game_reported rules have no measurable progress. */
export async function ruleProgress(
  tx: Executor,
  userId: string,
  rule: AchievementRule,
  gameId: string | null,
  stats: UserStats,
): Promise<[number, number] | null> {
  switch (rule.type) {
    case "runs_completed":
      return [stats.runsCompleted, rule.count];
    case "distinct_games":
      return [stats.distinctGames, rule.count];
    case "distinct_days":
      return [stats.distinctDays, rule.count];
    case "first_leaderboard_entry":
      return [stats.hasLeaderboardEntry ? 1 : 0, 1];
    case "challenges_completed":
      return [stats.challengesCompleted, rule.count];
    case "level":
      return [stats.level, rule.level];
    case "score_at_least": {
      if (!gameId) return null;
      const [row] = await tx
        .select({ best: sql<number>`max(${leaderboardEntries.score})` })
        .from(leaderboardEntries)
        .innerJoin(leaderboardDefinitions, eq(leaderboardDefinitions.id, leaderboardEntries.leaderboardId))
        .where(
          and(
            eq(leaderboardEntries.userId, userId),
            eq(leaderboardDefinitions.gameId, gameId),
            eq(leaderboardDefinitions.key, rule.leaderboard),
          ),
        );
      return [Number(row?.best ?? 0), rule.score];
    }
    case "game_reported":
      return null;
  }
}

/**
 * Re-evaluates server-verifiable achievements for a user and unlocks any that
 * are now satisfied. Loops because unlock XP can cross a level threshold.
 * Returns the newly unlocked achievements.
 */
export async function evaluateAchievements(tx: Executor, userId: string, gameIds: string[] = []) {
  const unlocked: { id: number; key: string; title: string; xp: number }[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const candidates = await tx
      .select({ a: achievements })
      .from(achievements)
      .leftJoin(achievementUnlocks, and(eq(achievementUnlocks.achievementId, achievements.id), eq(achievementUnlocks.userId, userId)))
      .where(
        and(
          eq(achievements.active, true),
          isNull(achievementUnlocks.userId),
          gameIds.length
            ? sql`(${achievements.gameId} is null or ${inArray(achievements.gameId, gameIds)})`
            : isNull(achievements.gameId),
        ),
      );
    if (candidates.length === 0) break;
    const stats = await getUserStats(tx, userId);
    let changed = false;
    for (const { a } of candidates) {
      if (a.rule.type === "game_reported") continue;
      const p = await ruleProgress(tx, userId, a.rule, a.gameId, stats);
      if (!p || p[0] < p[1]) continue;
      const ins = await tx.insert(achievementUnlocks).values({ userId, achievementId: a.id }).onConflictDoNothing().returning();
      if (ins.length === 0) continue;
      await grantXp(tx, userId, a.xp, "achievement", `achievement:${a.id}`);
      unlocked.push({ id: a.id, key: a.key, title: a.title, xp: a.xp });
      changed = true;
    }
    if (!changed) break;
  }
  return unlocked;
}

/** Number of completed runs today, used for the daily-first-play bonus. */
export async function completedRunsToday(tx: Executor, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(gameRuns)
    .where(
      and(
        eq(gameRuns.userId, userId),
        gte(gameRuns.startedAt, new Date(`${utcDay()}T00:00:00Z`)),
        isNotNull(gameRuns.endedAt),
        sql`extract(epoch from (${gameRuns.endedAt} - ${gameRuns.startedAt})) >= ${XP_RULES.completedRunSeconds}`,
      ),
    );
  return Number(row?.n ?? 0);
}

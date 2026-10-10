import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { achievementUnlocks, achievements, games, profiles, user } from "@/server/db/schema";
import type { AppUser } from "@/server/session";
import { getUserStats, ruleProgress } from "@/server/services/progression";
import { mediaUrl } from "@/server/services/storage";

export async function getProfileRow(userId: string) {
  const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
  if (p) return p;
  const [created] = await db.insert(profiles).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }))!;
}

export async function getShellUser(u: AppUser | null) {
  if (!u) return null;
  const p = await getProfileRow(u.id);
  const [row] = await db.select({ displayUsername: user.displayUsername }).from(user).where(eq(user.id, u.id));
  return {
    name: u.name,
    username: row?.displayUsername ?? u.username,
    role: u.role,
    avatarHue: p.avatarHue,
    avatarGlyph: p.avatarGlyph,
    frameId: p.frameId,
    level: p.level,
  };
}

/** Public profile by username (case-insensitive). */
export async function getPublicProfile(username: string) {
  const [row] = await db
    .select({ user, profile: profiles })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(and(eq(user.username, username.toLowerCase()), eq(user.banned, false)));
  return row ?? null;
}

/** All achievements (platform + game) with unlock state and measurable progress. */
export async function achievementsForUser(userId: string | null, gameId?: string) {
  const rows = await db
    .select({
      a: achievements,
      unlockedAt: achievementUnlocks.unlockedAt,
      gameTitle: games.title,
      gameSlug: games.slug,
    })
    .from(achievements)
    .leftJoin(
      achievementUnlocks,
      and(eq(achievementUnlocks.achievementId, achievements.id), userId ? eq(achievementUnlocks.userId, userId) : sql`false`),
    )
    .leftJoin(games, eq(games.id, achievements.gameId))
    .where(and(eq(achievements.active, true), gameId === undefined ? undefined : gameId === null ? isNull(achievements.gameId) : eq(achievements.gameId, gameId)))
    .orderBy(sql`${achievements.gameId} nulls first`, achievements.sortOrder, achievements.id);
  const stats = userId ? await getUserStats(db, userId) : null;
  return Promise.all(
    rows.map(async (r) => ({
      id: r.a.id,
      key: r.a.key,
      title: r.a.title,
      description: r.a.description,
      icon: r.a.icon,
      xp: r.a.xp,
      gameId: r.a.gameId,
      gameTitle: r.gameTitle,
      gameSlug: r.gameSlug,
      verified: r.a.rule.type !== "game_reported",
      unlockedAt: r.unlockedAt,
      progress: userId && stats && !r.unlockedAt ? await ruleProgress(db, userId, r.a.rule, r.a.gameId, stats) : null,
    })),
  );
}

export async function recentUnlocks(userId: string, limit = 6) {
  return db
    .select({ title: achievements.title, icon: achievements.icon, xp: achievements.xp, unlockedAt: achievementUnlocks.unlockedAt })
    .from(achievementUnlocks)
    .innerJoin(achievements, eq(achievements.id, achievementUnlocks.achievementId))
    .where(eq(achievementUnlocks.userId, userId))
    .orderBy(desc(achievementUnlocks.unlockedAt))
    .limit(limit);
}

export async function personalBests(userId: string) {
  const rows = await db.execute<{ slug: string; title: string; cover_key: string | null; best: number; runs: number }>(sql`
    select g.slug, g.title, g.cover_key, max(e.score)::int as best, count(*)::int as runs
    from leaderboard_entries e
    join leaderboard_definitions d on d.id = e.leaderboard_id
    join games g on g.id = d.game_id
    where e.user_id = ${userId} and d.key = 'highscore'
    group by g.slug, g.title, g.cover_key order by best desc limit 12
  `);
  return rows.map((r) => ({ slug: r.slug, title: r.title, cover: mediaUrl(r.cover_key), best: Number(r.best), runs: Number(r.runs) }));
}

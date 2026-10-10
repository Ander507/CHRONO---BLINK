import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games, leaderboardDefinitions } from "@/server/db/schema";
import { cached } from "@/server/cache";

export const PERIODS = ["daily", "weekly", "season", "all"] as const;
export type Period = (typeof PERIODS)[number];

/**
 * Period boundaries in UTC. Rankings "roll over" automatically because every
 * query filters on these windows — no destructive reset job is needed, and
 * past periods stay queryable.
 *   daily  — midnight UTC
 *   weekly — Monday 00:00 UTC (ISO week)
 *   season — calendar quarter (Season 1 = Jan–Mar …)
 */
export function periodStart(period: Period, now = new Date()): Date | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case "daily":
      return new Date(Date.UTC(y, m, d));
    case "weekly": {
      const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
      return new Date(Date.UTC(y, m, d - dow));
    }
    case "season":
      return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    case "all":
      return null;
  }
}
export function periodEnd(period: Period, now = new Date()): Date | null {
  const s = periodStart(period, now);
  if (!s) return null;
  if (period === "daily") return new Date(s.getTime() + 86_400_000);
  if (period === "weekly") return new Date(s.getTime() + 7 * 86_400_000);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 3, 1));
}
export function seasonLabel(now = new Date()) {
  return `Season ${Math.floor(now.getUTCMonth() / 3) + 1} · ${now.getUTCFullYear()}`;
}

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string | null;
  name: string;
  avatarHue: number;
  avatarGlyph: string;
  frameId: string | null;
  score: number;
  achievedAt: Date;
};

export async function getLeaderboardDefs(gameId: string) {
  return db
    .select()
    .from(leaderboardDefinitions)
    .where(and(eq(leaderboardDefinitions.gameId, gameId), eq(leaderboardDefinitions.active, true)))
    .orderBy(leaderboardDefinitions.id);
}

/** Best score per player within the period, ties broken by who got there first. */
export async function getTopScores(leaderboardId: number, period: Period, limit = 50): Promise<LeaderboardRow[]> {
  const since = periodStart(period);
  return cached(`lb:${leaderboardId}:${period}:${limit}:${since?.toISOString() ?? "all"}`, 10_000, async () => {
    const rows = await db.execute<{
      user_id: string;
      score: number;
      created_at: Date;
      username: string | null;
      name: string;
      avatar_hue: number | null;
      avatar_glyph: string | null;
      frame_id: string | null;
    }>(sql`
      with best as (
        select distinct on (e.user_id) e.user_id, e.score, e.created_at
        from leaderboard_entries e
        where e.leaderboard_id = ${leaderboardId}
          and e.hidden = false
          ${since ? sql`and e.created_at >= ${since.toISOString()}` : sql``}
        order by e.user_id, e.score desc, e.created_at asc
      )
      select b.user_id, b.score, b.created_at, u.display_username as username, u.name,
             p.avatar_hue, p.avatar_glyph, p.frame_id
      from best b
      join "user" u on u.id = b.user_id and u.banned = false
      left join profiles p on p.user_id = b.user_id
      order by b.score desc, b.created_at asc
      limit ${limit}
    `);
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      name: r.name,
      avatarHue: r.avatar_hue ?? 265,
      avatarGlyph: r.avatar_glyph ?? "bolt",
      frameId: r.frame_id,
      score: Number(r.score),
      achievedAt: new Date(r.created_at),
    }));
  });
}

/** The player's best in the period and their 1-based rank, or null if unranked. */
export async function getPlayerStanding(leaderboardId: number, userId: string, period: Period) {
  const since = periodStart(period);
  const rows = await db.execute<{ best: number | null; first_at: Date | null; rank: number | null }>(sql`
    with mine as (
      select score as best, created_at as first_at from leaderboard_entries
      where leaderboard_id = ${leaderboardId} and user_id = ${userId} and hidden = false
        ${since ? sql`and created_at >= ${since.toISOString()}` : sql``}
      order by score desc, created_at asc limit 1
    ), best as (
      select distinct on (e.user_id) e.user_id, e.score, e.created_at
      from leaderboard_entries e join "user" u on u.id = e.user_id and u.banned = false
      where e.leaderboard_id = ${leaderboardId} and e.hidden = false
        ${since ? sql`and e.created_at >= ${since.toISOString()}` : sql``}
      order by e.user_id, e.score desc, e.created_at asc
    )
    select m.best, m.first_at,
      (select count(*) + 1 from best b where b.user_id <> ${userId}
         and (b.score > m.best or (b.score = m.best and b.created_at < m.first_at)))::int as rank
    from mine m
  `);
  const r = rows[0];
  if (!r || r.best == null) return null;
  return { best: Number(r.best), rank: Number(r.rank) };
}

/** Games that have at least one active leaderboard, for /leaderboards. */
export async function getLeaderboardGames() {
  return cached("lb:games", 30_000, () =>
    db
      .selectDistinctOn([games.id], {
        id: games.id,
        slug: games.slug,
        title: games.title,
        coverKey: games.coverKey,
        accentColor: games.accentColor,
      })
      .from(games)
      .innerJoin(leaderboardDefinitions, eq(leaderboardDefinitions.gameId, games.id))
      .where(and(eq(games.status, "published"), eq(leaderboardDefinitions.active, true)))
      .orderBy(games.id),
  );
}

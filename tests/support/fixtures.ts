/** Test fixtures — clearly test-only data created inside the isolated test database. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, gameVersions, games, leaderboardDefinitions, profiles, user, type Role } from "@/server/db/schema";
import type { AppUser } from "@/server/session";
import { utcDay } from "@/lib/utils";

export async function resetDb() {
  await db.execute(sql`
    truncate table audit_logs, ad_events, ad_placements, gameplay_events, challenge_progress, daily_challenges, challenge_definitions,
      leaderboard_entries, leaderboard_definitions, achievement_unlocks, achievements, xp_transactions, cloud_saves, game_runs,
      game_sessions, favorites, featured_placements, game_reports, game_assets, game_versions, games, developers, categories,
      profiles, session, account, verification, "user", rate_limits, dev_mailbox restart identity cascade`);
}

export async function makeUser(opts: { role?: Role; name?: string } = {}): Promise<AppUser> {
  const id = randomUUID();
  const handle = `p_${id.slice(0, 8)}`;
  await db.insert(user).values({
    id,
    name: opts.name ?? handle,
    email: `${handle}@test.invalid`,
    emailVerified: true,
    username: handle,
    displayUsername: handle,
    role: opts.role ?? "user",
  });
  await db.insert(profiles).values({ userId: id });
  return { id, email: `${handle}@test.invalid`, name: handle, username: handle, image: null, role: opts.role ?? "user", emailVerified: true };
}

/** A published game with a live version and a provisional highscore board. */
export async function makeGame(opts: { slug?: string; maxScorePerSecond?: number; minRunSeconds?: number; maxScore?: number } = {}) {
  const [cat] = await db
    .insert(categories)
    .values({ slug: `cat-${randomUUID().slice(0, 6)}`, name: "Test" })
    .returning();
  const slug = opts.slug ?? `game-${randomUUID().slice(0, 8)}`;
  const [g] = await db.insert(games).values({ slug, title: slug, status: "published", categoryId: cat!.id, publishedAt: new Date() }).returning();
  const [v] = await db.insert(gameVersions).values({ gameId: g!.id, version: 1, status: "live", scanStatus: "skipped_trusted" }).returning();
  await db.update(games).set({ liveVersionId: v!.id }).where(sql`id = ${g!.id}`);
  const [lb] = await db
    .insert(leaderboardDefinitions)
    .values({
      gameId: g!.id,
      key: "highscore",
      title: "High Score",
      maxScore: opts.maxScore ?? 1_000_000,
      maxScorePerSecond: opts.maxScorePerSecond ?? 100,
      baseAllowance: 0,
      minRunSeconds: opts.minRunSeconds ?? 3,
    })
    .returning();
  return { game: { ...g!, liveVersionId: v!.id }, version: v!, leaderboard: lb!, category: cat! };
}

/** Moves a run's start time into the past so tests don't have to wait in real time. */
export async function ageRun(runId: string, seconds: number) {
  await db.execute(sql`update game_runs set started_at = now() - make_interval(secs => ${seconds}) where id = ${runId}`);
}

export const today = () => utcDay();

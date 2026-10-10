import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import {
  achievementUnlocks,
  achievements,
  cloudSaves,
  gameRuns,
  gameSessions,
  games,
  leaderboardDefinitions,
  leaderboardEntries,
  profiles,
  user,
} from "@/server/db/schema";
import { XP_RULES } from "@/lib/progression";
import { utcDay } from "@/lib/utils";
import { HttpError, type AppUser } from "@/server/session";
import { invalidate } from "@/server/cache";
import { applyChallengeSignal } from "@/server/services/challenges";
import { completedRunsToday, evaluateAchievements, grantXp } from "@/server/services/progression";
import { getPlayerStanding } from "@/server/services/leaderboards";
import type { ScoreResult } from "@chronoblink/sdk/protocol";

const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_HEARTBEAT_SECONDS = 120;
const RUN_START_MIN_GAP_MS = 1500;
const SCORE_WINDOW_AFTER_RUN_MS = 90_000;
export const SAVE_MAX_BYTES = 16 * 1024;
export const SAVE_MAX_KEYS = 32;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Serialises concurrent writes for one player inside a transaction (XP caps, unlocks). */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`user:${userId}`}))`);
}

export type PlaySession = typeof gameSessions.$inferSelect;

export async function createPlaySession(opts: {
  gameSlug: string;
  user: AppUser | null;
  anonId: string | null;
  device: "desktop" | "mobile" | "tablet";
}) {
  const game = await db.query.games.findFirst({
    where: and(eq(games.slug, opts.gameSlug), eq(games.status, "published")),
    columns: { id: true, liveVersionId: true },
  });
  if (!game?.liveVersionId) throw new HttpError(404, "not_found", "Game not available");
  const token = randomBytes(32).toString("base64url");
  const [s] = await db
    .insert(gameSessions)
    .values({
      gameId: game.id,
      versionId: game.liveVersionId,
      userId: opts.user?.id ?? null,
      anonId: opts.user ? null : opts.anonId,
      tokenHash: sha256(token),
      device: opts.device,
      day: utcDay(),
    })
    .returning({ id: gameSessions.id });
  return { sessionId: s!.id, token, gameId: game.id };
}

/**
 * Every runtime call presents the session id plus the bearer token that only
 * the player page holds. A signed-in session additionally requires the same
 * signed-in user, so a leaked token can't be replayed from another account.
 */
export async function authorizeSession(sessionId: string, token: string, current: AppUser | null): Promise<PlaySession> {
  const s = await db.query.gameSessions.findFirst({ where: eq(gameSessions.id, sessionId) });
  if (!s || s.tokenHash !== sha256(token)) throw new HttpError(401, "invalid_session", "Unknown play session");
  if (s.userId && s.userId !== current?.id) throw new HttpError(403, "session_owner", "Session belongs to another account");
  if (Date.now() - s.startedAt.getTime() > SESSION_MAX_AGE_MS) throw new HttpError(410, "session_expired", "Play session expired");
  return s;
}

/**
 * Active-time accounting. The client reports seconds of *visible, focused,
 * unpaused* play since its last heartbeat; the server clamps that to the wall
 * clock since the previous heartbeat so background tabs or forged values
 * can't inflate playtime.
 */
export async function heartbeat(
  s: PlaySession,
  input: { activeSeconds: number; loadState?: "loaded" | "failed"; loadMs?: number; ended?: boolean },
) {
  const now = Date.now();
  const wall = Math.max(0, (now - s.lastSeenAt.getTime()) / 1000) + 2;
  const delta = Math.max(0, Math.min(Math.floor(input.activeSeconds), Math.ceil(wall), MAX_HEARTBEAT_SECONDS));
  await db
    .update(gameSessions)
    .set({
      activeSeconds: sql`${gameSessions.activeSeconds} + ${delta}`,
      lastSeenAt: new Date(now),
      ...(input.loadState && s.loadState === "loading" ? { loadState: input.loadState } : {}),
      ...(input.loadMs != null && s.loadMs == null ? { loadMs: Math.min(600_000, Math.max(0, Math.floor(input.loadMs))) } : {}),
      ...(input.ended ? { endedAt: new Date(now) } : {}),
    })
    .where(eq(gameSessions.id, s.id));
  if (input.ended) await endRun(s);
  if (input.loadState === "loaded") invalidate("catalog:trending");
  return { counted: delta };
}

async function openRun(tx: Tx | typeof db, sessionId: string) {
  return tx.query.gameRuns.findFirst({
    where: and(eq(gameRuns.sessionId, sessionId), isNull(gameRuns.endedAt)),
    orderBy: desc(gameRuns.startedAt),
  });
}

export async function startRun(s: PlaySession) {
  const last = await db.query.gameRuns.findFirst({ where: eq(gameRuns.sessionId, s.id), orderBy: desc(gameRuns.startedAt) });
  if (last && Date.now() - last.startedAt.getTime() < RUN_START_MIN_GAP_MS && !last.endedAt) {
    return { runId: last.id };
  }
  await endRun(s);
  const [run] = await db.insert(gameRuns).values({ sessionId: s.id, gameId: s.gameId, userId: s.userId }).returning({ id: gameRuns.id });
  return { runId: run!.id };
}

/** Closes the open run (if any) and applies run-based progression for signed-in players. */
export async function endRun(s: PlaySession) {
  return db.transaction(async (tx) => {
    const run = await openRun(tx, s.id);
    if (!run) return { ended: false as const };
    const [closed] = await tx
      .update(gameRuns)
      .set({ endedAt: new Date() })
      .where(and(eq(gameRuns.id, run.id), isNull(gameRuns.endedAt)))
      .returning();
    if (!closed?.endedAt) return { ended: false as const };
    const runSeconds = (closed.endedAt.getTime() - closed.startedAt.getTime()) / 1000;
    if (!s.userId || runSeconds < XP_RULES.completedRunSeconds) return { ended: true as const, runSeconds };

    await lockUser(tx, s.userId);
    if ((await completedRunsToday(tx, s.userId)) === 1) {
      await grantXp(tx, s.userId, XP_RULES.dailyFirstPlay, "daily_first_play", `daily_play:${utcDay()}`);
    }
    await applyChallengeSignal(tx, s.userId, { kind: "run_completed", gameId: s.gameId, runSeconds });
    const unlocked = await evaluateAchievements(tx, s.userId, [s.gameId]);
    return { ended: true as const, runSeconds, unlocked };
  });
}

/**
 * Score submission rules (all server-side):
 *  - signed-in players only (guests are told to sign in)
 *  - the leaderboard must exist and be active for this game
 *  - the score must belong to a run the server timed: the open run, or one
 *    that ended in the last 90 s, and each run may post once per leaderboard
 *  - the run must have lasted ≥ minRunSeconds
 *  - 0 ≤ score ≤ maxScore and score ≤ baseAllowance + maxScorePerSecond × runSeconds
 * Rejections are recorded as gameplay events for moderators.
 */
export async function submitScore(s: PlaySession, input: { leaderboard: string; score: number }): Promise<ScoreResult> {
  const def = await db.query.leaderboardDefinitions.findFirst({
    where: and(
      eq(leaderboardDefinitions.gameId, s.gameId),
      eq(leaderboardDefinitions.key, input.leaderboard),
      eq(leaderboardDefinitions.active, true),
    ),
  });
  if (!def) return { accepted: false, reason: "unknown_leaderboard" };
  if (!s.userId) return { accepted: false, reason: "guest", provisional: def.verification === "provisional" };
  const userId = s.userId;

  const result = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const run = await tx.query.gameRuns.findFirst({
      where: and(
        eq(gameRuns.sessionId, s.id),
        sql`(${gameRuns.endedAt} is null or ${gameRuns.endedAt} > ${new Date(Date.now() - SCORE_WINDOW_AFTER_RUN_MS).toISOString()})`,
      ),
      orderBy: desc(gameRuns.startedAt),
    });
    if (!run) return { accepted: false, reason: "no_run" } as ScoreResult;
    const dup = await tx.query.leaderboardEntries.findFirst({
      where: and(eq(leaderboardEntries.leaderboardId, def.id), eq(leaderboardEntries.runId, run.id)),
      columns: { id: true },
    });
    if (dup) return { accepted: false, reason: "rejected" } as ScoreResult;

    const end = run.endedAt ?? new Date();
    const runSeconds = Math.max(0, (end.getTime() - run.startedAt.getTime()) / 1000);
    const score = Math.floor(input.score);
    const ceiling = def.baseAllowance + def.maxScorePerSecond * runSeconds;
    const problems: string[] = [];
    if (!Number.isInteger(score) || score < 0) problems.push("not_a_valid_integer");
    if (runSeconds < def.minRunSeconds) problems.push("run_too_short");
    if (score > def.maxScore) problems.push("above_max_score");
    if (score > ceiling) problems.push("above_rate_ceiling");
    if (problems.length) {
      await tx.execute(sql`insert into gameplay_events (event_id, name, game_id, session_id, user_id, props)
        values (gen_random_uuid(), 'score_rejected', ${s.gameId}, ${s.id}, ${userId},
        ${JSON.stringify({ leaderboard: def.key, score, runSeconds: Math.round(runSeconds), reasons: problems.join(",") })}::jsonb)`);
      return { accepted: false, reason: "rejected" } as ScoreResult;
    }

    await tx.insert(leaderboardEntries).values({
      leaderboardId: def.id,
      userId,
      runId: run.id,
      score,
      runSeconds: Math.round(runSeconds),
    });
    await tx.update(gameRuns).set({ scoredAt: new Date() }).where(eq(gameRuns.id, run.id));
    if (runSeconds >= XP_RULES.completedRunSeconds) {
      await grantXp(tx, userId, XP_RULES.scoredRun, "scored_run", `run:${run.id}`);
    }
    await applyChallengeSignal(tx, userId, { kind: "score", gameId: s.gameId, leaderboardKey: def.key, score });
    await evaluateAchievements(tx, userId, [s.gameId]);
    return { accepted: true, provisional: def.verification === "provisional" } as ScoreResult;
  });

  if (!result.accepted) return result;
  invalidate(`lb:${def.id}:`);
  const standing = await getPlayerStanding(def.id, userId, "all");
  return { ...result, best: standing?.best, rank: standing?.rank };
}

/**
 * Game-reported achievements can't be verified, so they're limited to
 * definitions explicitly marked `game_reported`, require a signed-in player
 * with a server-timed run of at least `minRunSeconds`, and their XP counts
 * toward the daily activity cap.
 */
export async function unlockGameAchievement(s: PlaySession, key: string) {
  if (!s.userId) return { unlocked: false };
  const userId = s.userId;
  const a = await db.query.achievements.findFirst({
    where: and(eq(achievements.gameId, s.gameId), eq(achievements.key, key), eq(achievements.active, true)),
  });
  if (!a || a.rule.type !== "game_reported") return { unlocked: false };
  const minRun = a.rule.minRunSeconds;
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const run = await tx.query.gameRuns.findFirst({ where: eq(gameRuns.sessionId, s.id), orderBy: desc(gameRuns.startedAt) });
    if (!run) return { unlocked: false };
    const runSeconds = ((run.endedAt ?? new Date()).getTime() - run.startedAt.getTime()) / 1000;
    if (runSeconds < minRun) return { unlocked: false };
    const ins = await tx.insert(achievementUnlocks).values({ userId, achievementId: a.id }).onConflictDoNothing().returning();
    if (ins.length === 0) return { unlocked: true };
    await grantXp(tx, userId, a.xp, "game_achievement", `achievement:${a.id}`);
    await evaluateAchievements(tx, userId, [s.gameId]);
    return { unlocked: true };
  });
}

// ── cloud saves (signed-in players; guests save device-locally in the player) ──

export async function saveCloud(s: PlaySession, key: string, value: unknown) {
  if (!s.userId) throw new HttpError(403, "guest", "Guests save locally");
  const json = JSON.stringify(value ?? null);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > SAVE_MAX_BYTES) throw new HttpError(413, "too_large", "Save data exceeds 16 KB");
  const [{ n }] = (await db
    .select({ n: count() })
    .from(cloudSaves)
    .where(and(eq(cloudSaves.userId, s.userId), eq(cloudSaves.gameId, s.gameId), sql`${cloudSaves.key} <> ${key}`))) as [{ n: number }];
  if (Number(n) >= SAVE_MAX_KEYS) throw new HttpError(409, "too_many_keys", `At most ${SAVE_MAX_KEYS} save slots per game`);
  await db
    .insert(cloudSaves)
    .values({ userId: s.userId, gameId: s.gameId, key, data: JSON.parse(json) as unknown, bytes })
    .onConflictDoUpdate({
      target: [cloudSaves.userId, cloudSaves.gameId, cloudSaves.key],
      set: { data: JSON.parse(json) as unknown, bytes, updatedAt: new Date() },
    });
  return { saved: true };
}

export async function loadCloud(s: PlaySession, key: string) {
  if (!s.userId) return { value: null };
  const row = await db.query.cloudSaves.findFirst({
    where: and(eq(cloudSaves.userId, s.userId), eq(cloudSaves.gameId, s.gameId), eq(cloudSaves.key, key)),
  });
  return { value: row?.data ?? null };
}

export async function deleteCloud(s: PlaySession, key: string) {
  if (!s.userId) return { deleted: false };
  await db.delete(cloudSaves).where(and(eq(cloudSaves.userId, s.userId), eq(cloudSaves.gameId, s.gameId), eq(cloudSaves.key, key)));
  return { deleted: true };
}

/**
 * Guest → account migration: device-local saves the guest chose to keep are
 * copied to the cloud, but never overwrite an existing cloud save.
 */
export async function importGuestSaves(userId: string, entries: { gameSlug: string; key: string; value: unknown }[]) {
  let imported = 0;
  for (const e of entries.slice(0, 64)) {
    const game = await db.query.games.findFirst({ where: eq(games.slug, e.gameSlug), columns: { id: true } });
    if (!game) continue;
    const json = JSON.stringify(e.value ?? null);
    const bytes = Buffer.byteLength(json, "utf8");
    if (bytes > SAVE_MAX_BYTES) continue;
    const res = await db
      .insert(cloudSaves)
      .values({ userId, gameId: game.id, key: e.key, data: JSON.parse(json) as unknown, bytes })
      .onConflictDoNothing()
      .returning();
    imported += res.length;
  }
  return imported;
}

/** What the SDK's init() returns for this player. */
export async function playerForSdk(current: AppUser | null) {
  if (!current) return { id: null, displayName: "Guest", isGuest: true };
  const u = await db.query.user.findFirst({ where: eq(user.id, current.id), columns: { displayUsername: true, name: true } });
  return { id: current.id, displayName: u?.displayUsername ?? u?.name ?? "Player", isGuest: false };
}

export async function recentSessionCount(gameId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(gameSessions)
    .where(and(eq(gameSessions.gameId, gameId), gt(gameSessions.startedAt, sql`now() - interval '1 day'`)));
  return Number(r?.n ?? 0);
}

export { profiles };

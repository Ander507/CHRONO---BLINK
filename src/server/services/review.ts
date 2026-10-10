import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { gameVersions, games, leaderboardDefinitions } from "@/server/db/schema";
import { GAME_META_FILE, EXTRA_ORIGIN_RE, publishedPrefix, stagingPrefix } from "@/server/game-host-policy";
import { HttpError, type AppUser } from "@/server/session";
import { audit } from "@/server/audit";
import { invalidate } from "@/server/cache";
import { storage } from "@/server/services/storage";

export type ApproveInput = {
  notes: string;
  cspExtraOrigins: string[];
  leaderboard: { enabled: boolean; maxScore: number; maxScorePerSecond: number; minRunSeconds: number };
};

/**
 * Approval = publication. Files are copied from private staging to the public
 * game prefix (served by the isolated game origin), the version goes live, the
 * previous live version is superseded, and the game becomes published.
 */
export async function approveVersion(actor: AppUser, versionId: string, input: ApproveInput) {
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  if (!v) throw new HttpError(404, "not_found", "Build not found");
  if (v.status !== "in_review") throw new HttpError(409, "bad_state", "Only builds in review can be approved");
  if (!["clean", "skipped_trusted"].includes(v.scanStatus)) throw new HttpError(409, "not_scanned", "Build has no passing scan result");
  const origins = input.cspExtraOrigins.map((o) => o.trim()).filter(Boolean);
  const bad = origins.find((o) => !EXTRA_ORIGIN_RE.test(o));
  if (bad) throw new HttpError(400, "bad_origin", `Not an allowed origin: ${bad}`);

  const from = stagingPrefix(v.gameId, v.id);
  const to = publishedPrefix(v.gameId, v.id);
  const copied = await storage.copyPrefix(from, to);
  if (copied === 0) throw new HttpError(409, "missing_files", "Staged files are missing; ask the developer to re-upload");
  await storage.put(`${to}/${GAME_META_FILE}`, Buffer.from(JSON.stringify({ cspExtraOrigins: origins })), "application/json");

  await db.transaction(async (tx) => {
    const game = await tx.query.games.findFirst({ where: eq(games.id, v.gameId) });
    if (!game) throw new HttpError(404, "not_found", "Game not found");
    if (game.liveVersionId) await tx.update(gameVersions).set({ status: "superseded" }).where(eq(gameVersions.id, game.liveVersionId));
    await tx
      .update(gameVersions)
      .set({ status: "live", storagePrefix: to, reviewedBy: actor.id, reviewedAt: new Date(), reviewNotes: input.notes, cspExtraOrigins: origins })
      .where(eq(gameVersions.id, v.id));
    await tx
      .update(games)
      .set({ liveVersionId: v.id, status: game.status === "unlisted" ? "unlisted" : "published", publishedAt: game.publishedAt ?? new Date(), statusReason: null })
      .where(eq(games.id, game.id));
    if (input.leaderboard.enabled) {
      const lb = { maxScore: input.leaderboard.maxScore, maxScorePerSecond: input.leaderboard.maxScorePerSecond, minRunSeconds: input.leaderboard.minRunSeconds };
      await tx
        .insert(leaderboardDefinitions)
        .values({ gameId: game.id, key: "highscore", title: "High Score", verification: "provisional", ...lb })
        .onConflictDoUpdate({ target: [leaderboardDefinitions.gameId, leaderboardDefinitions.key], set: lb });
    }
    await audit(actor.id, "version.approve", "game_version", v.id, { gameId: game.id, cspExtraOrigins: origins, leaderboard: input.leaderboard }, tx);
  });
  await storage.deletePrefix(from).catch(() => 0);
  invalidate("catalog:");
  invalidate("lb:");
}

export async function rejectVersion(actor: AppUser, versionId: string, notes: string) {
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  if (!v) throw new HttpError(404, "not_found", "Build not found");
  if (v.status !== "in_review") throw new HttpError(409, "bad_state", "Only builds in review can be rejected");
  if (notes.trim().length < 5) throw new HttpError(400, "notes_required", "Explain what needs to change");
  await db
    .update(gameVersions)
    .set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNotes: notes.trim() })
    .where(eq(gameVersions.id, v.id));
  const game = await db.query.games.findFirst({ where: eq(games.id, v.gameId) });
  if (game && game.status === "in_review") await db.update(games).set({ status: game.liveVersionId ? "published" : "rejected" }).where(eq(games.id, game.id));
  await audit(actor.id, "version.reject", "game_version", v.id, { notes });
}

/** Publication controls for staff: published ↔ unlisted, or removed (files deleted from the public origin). */
export async function setGameVisibility(actor: AppUser, gameId: string, status: "published" | "unlisted" | "removed", reason: string) {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!game) throw new HttpError(404, "not_found", "Game not found");
  if (status !== "removed" && !game.liveVersionId) throw new HttpError(409, "no_build", "Game has no approved build");
  await db
    .update(games)
    .set({ status, statusReason: status === "removed" ? reason || "Removed by moderators" : null, ...(status === "removed" ? { liveVersionId: null } : {}) })
    .where(eq(games.id, game.id));
  if (status === "removed") {
    // Safe deletion: public files go away immediately; DB history (versions, scores) is retained for audit.
    const live = await db.select({ id: gameVersions.id }).from(gameVersions).where(and(eq(gameVersions.gameId, game.id), inArray(gameVersions.status, ["live", "superseded"])));
    for (const v of live) await storage.deletePrefix(publishedPrefix(game.id, v.id)).catch(() => 0);
    await db.update(gameVersions).set({ status: "superseded" }).where(and(eq(gameVersions.gameId, game.id), eq(gameVersions.status, "live")));
  }
  await audit(actor.id, `game.${status}`, "game", game.id, { reason });
  invalidate("catalog:");
}

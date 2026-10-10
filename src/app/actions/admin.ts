"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { invalidate } from "@/server/cache";
import { db } from "@/server/db";
import {
  AD_PLACEMENT_KEYS,
  ROLES,
  achievements,
  adPlacements,
  categories,
  challengeDefinitions,
  developers,
  featuredPlacements,
  gameReports,
  games,
  leaderboardEntries,
  session,
  user,
} from "@/server/db/schema";
import { HttpError, assertRole } from "@/server/session";
import { invalidatePlacements } from "@/server/services/ads";
import { approveVersion, rejectVersion, setGameVisibility } from "@/server/services/review";
import { SLUG_RE } from "@/lib/validation";

type R = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>, paths: string[] = ["/admin"]): Promise<R> {
  try {
    await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error("[admin action]", e);
    return { ok: false, error: "Something went wrong" };
  }
}

const uuid = z.string().uuid();

// ── submissions ──────────────────────────────────────────────────────────────

const approveSchema = z.object({
  notes: z.string().trim().max(1000).default(""),
  cspExtraOrigins: z.array(z.string()).max(6).default([]),
  leaderboard: z.object({
    enabled: z.boolean(),
    maxScore: z.number().int().min(1).max(2_000_000_000),
    maxScorePerSecond: z.number().int().min(1).max(10_000_000),
    minRunSeconds: z.number().int().min(0).max(3600),
  }),
});

export async function approveVersionAction(versionId: string, input: unknown) {
  return run(async () => {
    const actor = await assertRole("moderator");
    await approveVersion(actor, uuid.parse(versionId), approveSchema.parse(input));
  }, ["/admin", "/"]);
}

export async function rejectVersionAction(versionId: string, notes: string) {
  return run(async () => {
    const actor = await assertRole("moderator");
    await rejectVersion(actor, uuid.parse(versionId), z.string().max(1000).parse(notes));
  });
}

export async function setGameVisibilityAction(gameId: string, status: "published" | "unlisted" | "removed", reason: string) {
  return run(async () => {
    const actor = await assertRole(status === "removed" ? "admin" : "moderator");
    await setGameVisibility(actor, uuid.parse(gameId), z.enum(["published", "unlisted", "removed"]).parse(status), z.string().max(500).parse(reason));
  }, ["/admin", "/"]);
}

// ── reports & moderation ─────────────────────────────────────────────────────

export async function resolveReportAction(id: number, status: "resolved" | "dismissed", resolution: string) {
  return run(async () => {
    const actor = await assertRole("moderator");
    await db
      .update(gameReports)
      .set({ status: z.enum(["resolved", "dismissed"]).parse(status), resolution: z.string().max(1000).parse(resolution), resolvedBy: actor.id, resolvedAt: new Date() })
      .where(eq(gameReports.id, z.number().int().parse(id)));
    await audit(actor.id, `report.${status}`, "report", id, { resolution });
  });
}

export async function setBanAction(userId: string, banned: boolean, reason: string) {
  return run(async () => {
    const actor = await assertRole("moderator");
    if (userId === actor.id) throw new HttpError(400, "self", "You can't ban yourself");
    const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target) throw new HttpError(404, "not_found", "User not found");
    if (target.role === "admin" || (target.role === "moderator" && actor.role !== "admin")) throw new HttpError(403, "forbidden", "You can't ban staff");
    await db.update(user).set({ banned, banReason: banned ? reason || "Violation of the Terms" : null }).where(eq(user.id, userId));
    if (banned) await db.delete(session).where(eq(session.userId, userId));
    await audit(actor.id, banned ? "user.ban" : "user.unban", "user", userId, { reason });
  });
}

export async function setRoleAction(userId: string, role: string) {
  return run(async () => {
    const actor = await assertRole("admin");
    if (userId === actor.id) throw new HttpError(400, "self", "You can't change your own role");
    const r = z.enum(ROLES).parse(role);
    await db.update(user).set({ role: r }).where(eq(user.id, userId));
    await audit(actor.id, "user.role", "user", userId, { role: r });
  });
}

export async function hideScoreAction(entryId: number, hidden: boolean) {
  return run(async () => {
    const actor = await assertRole("moderator");
    await db.update(leaderboardEntries).set({ hidden }).where(eq(leaderboardEntries.id, z.number().int().parse(entryId)));
    invalidate("lb:");
    await audit(actor.id, hidden ? "score.hide" : "score.unhide", "leaderboard_entry", entryId);
  });
}

// ── developers ───────────────────────────────────────────────────────────────

export async function setDeveloperAction(devId: string, patch: { trusted?: boolean; status?: "active" | "suspended" }) {
  return run(async () => {
    const actor = await assertRole("admin");
    const p = z.object({ trusted: z.boolean().optional(), status: z.enum(["active", "suspended"]).optional() }).parse(patch);
    await db.update(developers).set(p).where(eq(developers.id, uuid.parse(devId)));
    await audit(actor.id, "developer.update", "developer", devId, p);
  });
}

// ── featured & sponsored ─────────────────────────────────────────────────────

const featureSchema = z.object({
  gameId: uuid,
  headline: z.string().trim().max(80).default(""),
  sponsored: z.boolean().default(false),
  sponsorName: z.string().trim().max(60).default(""),
  sortOrder: z.number().int().min(0).max(100).default(10),
  endsAt: z.string().default(""),
});

export async function addFeaturedAction(input: unknown) {
  return run(async () => {
    const actor = await assertRole("admin");
    const f = featureSchema.parse(input);
    if (f.sponsored && !f.sponsorName) throw new HttpError(400, "sponsor", "Sponsored placements must name the sponsor");
    const [row] = await db
      .insert(featuredPlacements)
      .values({
        gameId: f.gameId,
        slot: "hero",
        headline: f.headline || null,
        sponsored: f.sponsored,
        sponsorName: f.sponsored ? f.sponsorName : null,
        sortOrder: f.sortOrder,
        endsAt: f.endsAt ? new Date(f.endsAt) : null,
        createdBy: actor.id,
      })
      .returning();
    invalidate("catalog:");
    await audit(actor.id, "featured.add", "featured", row!.id, f);
  }, ["/admin", "/"]);
}

export async function removeFeaturedAction(id: number) {
  return run(async () => {
    const actor = await assertRole("admin");
    await db.delete(featuredPlacements).where(eq(featuredPlacements.id, z.number().int().parse(id)));
    invalidate("catalog:");
    await audit(actor.id, "featured.remove", "featured", id);
  }, ["/admin", "/"]);
}

// ── categories ───────────────────────────────────────────────────────────────

const categorySchema = z.object({
  slug: z.string().trim().regex(SLUG_RE).max(32),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).default(""),
  icon: z.string().trim().max(32).default("gamepad-2"),
  sortOrder: z.number().int().min(0).max(1000).default(100),
});

export async function upsertCategoryAction(id: number | null, input: unknown) {
  return run(async () => {
    const actor = await assertRole("admin");
    const c = categorySchema.parse(input);
    if (id) await db.update(categories).set(c).where(eq(categories.id, id));
    else await db.insert(categories).values(c);
    invalidate("catalog:");
    await audit(actor.id, id ? "category.update" : "category.create", "category", id ?? c.slug, c);
  }, ["/admin", "/"]);
}

export async function deleteCategoryAction(id: number) {
  return run(async () => {
    const actor = await assertRole("admin");
    const [{ n }] = (await db.select({ n: count() }).from(games).where(eq(games.categoryId, id))) as [{ n: number }];
    if (Number(n) > 0) throw new HttpError(409, "in_use", "Move this category's games first");
    await db.delete(categories).where(eq(categories.id, id));
    invalidate("catalog:");
    await audit(actor.id, "category.delete", "category", id);
  }, ["/admin", "/"]);
}

// ── challenges & achievements ────────────────────────────────────────────────

const challengeSchema = z.object({
  gameId: uuid,
  type: z.enum(["score_at_least", "runs_completed", "run_seconds_at_least"]),
  targets: z.array(z.number().int().positive()).min(1).max(10),
  titleTemplate: z.string().trim().min(5).max(120).refine((s) => s.includes("{target}"), "Title must contain {target}"),
  rewardXp: z.number().int().min(10).max(500),
});

export async function createChallengeDefinitionAction(input: unknown) {
  return run(async () => {
    const actor = await assertRole("admin");
    const c = challengeSchema.parse(input);
    const [row] = await db
      .insert(challengeDefinitions)
      .values({ ...c, leaderboardKey: c.type === "score_at_least" ? "highscore" : null })
      .returning();
    await audit(actor.id, "challenge_def.create", "challenge_definition", row!.id, c);
  });
}

export async function toggleChallengeDefinitionAction(id: number, active: boolean) {
  return run(async () => {
    const actor = await assertRole("admin");
    await db.update(challengeDefinitions).set({ active }).where(eq(challengeDefinitions.id, id));
    await audit(actor.id, "challenge_def.toggle", "challenge_definition", id, { active });
  });
}

export async function updateAchievementAction(id: number, patch: { active?: boolean; xp?: number }) {
  return run(async () => {
    const actor = await assertRole("admin");
    const p = z.object({ active: z.boolean().optional(), xp: z.number().int().min(0).max(1000).optional() }).parse(patch);
    await db.update(achievements).set(p).where(eq(achievements.id, id));
    await audit(actor.id, "achievement.update", "achievement", id, p);
  });
}

const newAchievementSchema = z.object({
  gameId: uuid.nullable(),
  key: z.string().regex(/^[a-z0-9_-]{2,48}$/),
  title: z.string().trim().min(3).max(60),
  description: z.string().trim().min(5).max(200),
  xp: z.number().int().min(0).max(500),
  icon: z.string().max(32).default("trophy"),
  rule: z.discriminatedUnion("type", [
    z.object({ type: z.literal("score_at_least"), leaderboard: z.string().default("highscore"), score: z.number().int().positive() }),
    z.object({ type: z.literal("game_reported"), minRunSeconds: z.number().int().min(0).max(3600) }),
    z.object({ type: z.literal("runs_completed"), count: z.number().int().positive() }),
    z.object({ type: z.literal("distinct_games"), count: z.number().int().positive() }),
    z.object({ type: z.literal("distinct_days"), count: z.number().int().positive() }),
    z.object({ type: z.literal("level"), level: z.number().int().positive() }),
    z.object({ type: z.literal("challenges_completed"), count: z.number().int().positive() }),
  ]),
});

export async function createAchievementAction(input: unknown) {
  return run(async () => {
    const actor = await assertRole("admin");
    const a = newAchievementSchema.parse(input);
    if ((a.rule.type === "score_at_least" || a.rule.type === "game_reported") && !a.gameId) throw new HttpError(400, "game", "This rule needs a game");
    const exists = await db.query.achievements.findFirst({
      where: and(eq(achievements.key, a.key), a.gameId ? eq(achievements.gameId, a.gameId) : isNull(achievements.gameId)),
    });
    if (exists) throw new HttpError(409, "exists", "An achievement with this key already exists");
    const [row] = await db.insert(achievements).values(a).returning();
    await audit(actor.id, "achievement.create", "achievement", row!.id, a);
  });
}

// ── advertising ──────────────────────────────────────────────────────────────

const placementSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["none", "adsense", "h5_games_ads"]),
  clientId: z.string().trim().regex(/^(ca-pub-\d{10,20})?$/, "Publisher id looks like ca-pub-1234567890").default(""),
  slotId: z.string().trim().regex(/^\d{0,20}$/, "Slot id is numeric").default(""),
  frequencyCapSeconds: z.number().int().min(30).max(3600),
});

export async function updatePlacementAction(key: string, input: unknown) {
  return run(async () => {
    const actor = await assertRole("admin");
    const k = z.enum(AD_PLACEMENT_KEYS).parse(key);
    const p = placementSchema.parse(input);
    if (p.enabled && p.provider === "none") throw new HttpError(400, "provider", "Choose a provider before enabling");
    if (p.enabled && !p.clientId) throw new HttpError(400, "credentials", "A publisher id from an approved provider account is required");
    const values = { enabled: p.enabled, provider: p.provider, config: { clientId: p.clientId, slotId: p.slotId }, frequencyCapSeconds: p.frequencyCapSeconds, updatedBy: actor.id };
    await db.insert(adPlacements).values({ key: k, ...values }).onConflictDoUpdate({ target: adPlacements.key, set: values });
    invalidatePlacements();
    await audit(actor.id, "ads.placement", "ad_placement", k, { enabled: p.enabled, provider: p.provider, frequencyCapSeconds: p.frequencyCapSeconds });
  });
}

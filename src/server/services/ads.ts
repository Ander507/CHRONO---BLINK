import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { AD_PLACEMENT_KEYS, adEvents, adPlacements, type AdPlacementKey } from "@/server/db/schema";
import { cached, invalidate } from "@/server/cache";
import type { PlaySession } from "@/server/services/play";

export type PlacementConfig = {
  key: AdPlacementKey;
  enabled: boolean;
  provider: "none" | "adsense" | "h5_games_ads";
  config: Record<string, string>;
  frequencyCapSeconds: number;
};

/** A provider is only "live" when it's enabled AND has the credentials it needs. */
export function isLive(p: PlacementConfig): boolean {
  if (!p.enabled || p.provider === "none") return false;
  if (p.provider === "adsense") return Boolean(p.config.clientId && p.config.slotId);
  if (p.provider === "h5_games_ads") return Boolean(p.config.clientId);
  return false;
}

export async function getPlacements(): Promise<Record<AdPlacementKey, PlacementConfig>> {
  return cached("ads:placements", 30_000, async () => {
    const rows = await db.select().from(adPlacements);
    const map = Object.fromEntries(
      AD_PLACEMENT_KEYS.map((k) => [k, { key: k, enabled: false, provider: "none", config: {}, frequencyCapSeconds: 180 }]),
    ) as Record<AdPlacementKey, PlacementConfig>;
    for (const r of rows) map[r.key] = { key: r.key, enabled: r.enabled, provider: r.provider, config: r.config, frequencyCapSeconds: r.frequencyCapSeconds };
    return map;
  });
}

export function invalidatePlacements() {
  invalidate("ads:placements");
}

/** Public, non-secret config a display slot needs to render (or null when ads are off). */
export async function displaySlot(key: "home_banner" | "catalog_inline" | "game_sidebar") {
  const p = (await getPlacements())[key];
  if (!isLive(p)) return null;
  return { provider: p.provider, clientId: p.config.clientId ?? "", slotId: p.config.slotId ?? "" };
}

/**
 * In-game ad request (interstitial at a natural break, or rewarded).
 * Order of checks: consent → placement live → frequency cap. Every outcome is
 * logged to ad_events for frequency capping and honest reporting; nothing here
 * is ever counted as revenue.
 */
export async function requestGameAd(s: PlaySession, type: "midgame" | "rewarded", consentAds: boolean) {
  const key: AdPlacementKey = type === "rewarded" ? "rewarded" : "interstitial";
  const p = (await getPlacements())[key];
  const log = (event: (typeof adEvents.$inferInsert)["event"]) =>
    db.insert(adEvents).values({ placementKey: key, sessionId: s.id, userId: s.userId, event });

  if (!isLive(p)) {
    await log("unavailable");
    return { allowed: false as const, reason: "ads_not_configured" };
  }
  if (!consentAds) {
    await log("unavailable");
    return { allowed: false as const, reason: "no_consent" };
  }
  if (type === "midgame") {
    const recent = await db.query.adEvents.findFirst({
      where: and(
        eq(adEvents.sessionId, s.id),
        inArray(adEvents.event, ["started", "completed"]),
        gt(adEvents.createdAt, new Date(Date.now() - p.frequencyCapSeconds * 1000)),
      ),
      orderBy: desc(adEvents.createdAt),
    });
    if (recent) {
      await log("capped");
      return { allowed: false as const, reason: "frequency_cap" };
    }
  }
  await log("requested");
  return { allowed: true as const, provider: p.provider, clientId: p.config.clientId ?? "" };
}

export async function recordAdOutcome(s: PlaySession, type: "midgame" | "rewarded", event: "started" | "completed" | "failed") {
  await db.insert(adEvents).values({ placementKey: type === "rewarded" ? "rewarded" : "interstitial", sessionId: s.id, userId: s.userId, event });
}

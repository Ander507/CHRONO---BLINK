import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { errorResponse, json } from "@/server/http";
import { purgeExpiredRateLimits } from "@/server/rate-limit";
import { HttpError } from "@/server/session";
import { applyRetention } from "@/server/services/analytics";
import { ensureDailyChallenge } from "@/server/services/challenges";
import { utcDay } from "@/lib/utils";

/**
 * Daily maintenance (schedule shortly after 00:00 UTC, e.g. Cloudflare Cron
 * Trigger or any scheduler): creates today's and tomorrow's daily challenge,
 * applies analytics retention and purges stale rate-limit rows.
 * Leaderboard periods roll over by time window, so no reset is required.
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" https://www.chronoblink.xyz/api/cron/daily
 */
export async function POST(req: Request) {
  try {
    const expected = env.CRON_SECRET;
    const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new HttpError(401, "unauthorized");
    }
    const today = await ensureDailyChallenge(utcDay());
    const tomorrow = await ensureDailyChallenge(utcDay(new Date(Date.now() + 86_400_000)));
    const retention = await applyRetention();
    await purgeExpiredRateLimits();
    return json({ ok: true, today: today?.title ?? null, tomorrow: tomorrow?.title ?? null, retention });
  } catch (e) {
    return errorResponse(e);
  }
}

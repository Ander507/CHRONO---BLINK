import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { HttpError } from "@/server/session";

/**
 * Fixed-window counter in Postgres, so limits hold across app instances
 * without extra infrastructure. One upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  if (env.E2E_DISABLE_RATE_LIMITS) return { ok: true, count: 0, retryAfter: 0 };
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows[0]!;
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return { ok: count <= limit, count, retryAfter: Math.max(1, Math.ceil(windowSeconds - elapsed)) };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new HttpError(429, "rate_limited", `Too many requests — try again in ${r.retryAfter}s`);
}

export async function purgeExpiredRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}

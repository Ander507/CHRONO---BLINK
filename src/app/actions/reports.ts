"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { gameReports, games } from "@/server/db/schema";
import { env, integrations } from "@/server/env";
import { clientIp } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";
import { reportSchema } from "@/lib/validation";

async function verifyTurnstile(token: string | undefined, ip: string) {
  if (!integrations.turnstile) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip }),
  });
  const data = (await res.json().catch(() => ({ success: false }))) as { success: boolean };
  return data.success;
}

export async function submitReport(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid report" };
  const ip = clientIp(await headers());
  const user = await getCurrentUser();
  const limit = await rateLimit(`report:${user?.id ?? ip}`, 5, 3600);
  if (!limit.ok) return { ok: false, error: "You've sent several reports recently. Please try again later." };
  if (!user && !(await verifyTurnstile(parsed.data.turnstileToken, ip))) return { ok: false, error: "Verification failed" };
  const game = await db.query.games.findFirst({ where: eq(games.id, parsed.data.gameId), columns: { id: true } });
  if (!game) return { ok: false, error: "Game not found" };
  await db.insert(gameReports).values({
    gameId: game.id,
    userId: user?.id ?? null,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });
  return { ok: true };
}

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { favorites, games } from "@/server/db/schema";
import { enforceRateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";

export async function toggleFavorite(gameId: string, favorite: boolean): Promise<{ ok: boolean; favorite?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "signin" };
  if (!z.string().uuid().safeParse(gameId).success) return { ok: false, error: "invalid" };
  try {
    await enforceRateLimit(`fav:${user.id}`, 60, 60);
  } catch {
    return { ok: false, error: "Slow down a little." };
  }
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId), columns: { id: true, status: true } });
  if (!game || game.status !== "published") return { ok: false, error: "Game not found" };
  if (favorite) {
    await db.insert(favorites).values({ userId: user.id, gameId }).onConflictDoNothing();
  } else {
    await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.gameId, gameId)));
  }
  revalidatePath("/favorites");
  return { ok: true, favorite };
}

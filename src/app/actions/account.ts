"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AVATAR_GLYPHS, COSMETICS, cosmeticUnlocked } from "@/lib/progression";
import { displayNameSchema } from "@/lib/validation";
import { db } from "@/server/db";
import { profiles, user } from "@/server/db/schema";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUser } from "@/server/session";
import { importGuestSaves } from "@/server/services/play";
import { getProfileRow } from "@/server/services/profiles";

type Result = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  name: displayNameSchema,
  bio: z.string().trim().max(280, "Max 280 characters"),
  avatarHue: z.number().int().min(0).max(359),
  avatarGlyph: z.enum(AVATAR_GLYPHS),
  frameId: z.string().nullable(),
  themeId: z.string().nullable(),
});

export async function updateProfile(input: unknown): Promise<Result> {
  const u = await assertUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid profile" };
  await enforceRateLimit(`profile:${u.id}`, 20, 60);
  const p = await getProfileRow(u.id);
  // Cosmetics are earned through levels; the server re-checks ownership.
  for (const [id, kind] of [
    [parsed.data.frameId, "frame"],
    [parsed.data.themeId, "theme"],
  ] as const) {
    if (!id) continue;
    const c = COSMETICS.find((x) => x.id === id && x.kind === kind);
    if (!c || !cosmeticUnlocked(c, p.level)) return { ok: false, error: "That cosmetic isn't unlocked yet" };
  }
  await db.update(user).set({ name: parsed.data.name }).where(eq(user.id, u.id));
  await db
    .update(profiles)
    .set({
      bio: parsed.data.bio,
      avatarHue: parsed.data.avatarHue,
      avatarGlyph: parsed.data.avatarGlyph,
      frameId: parsed.data.frameId,
      themeId: parsed.data.themeId,
    })
    .where(eq(profiles.userId, u.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updatePrivacy(input: unknown): Promise<Result> {
  const u = await assertUser();
  const parsed = z.object({ isPublic: z.boolean(), showActivity: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  await db.update(profiles).set(parsed.data).where(eq(profiles.userId, u.id));
  revalidatePath("/settings");
  return { ok: true };
}

const importSchema = z
  .array(z.object({ gameSlug: z.string().regex(/^[a-z0-9-]{1,64}$/), key: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/), value: z.unknown() }))
  .max(64);

/** Optional guest → account migration of device-local game saves. Never overwrites cloud saves. */
export async function importDeviceSaves(input: unknown): Promise<{ ok: boolean; imported: number }> {
  const u = await assertUser();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, imported: 0 };
  await enforceRateLimit(`import:${u.id}`, 5, 3600);
  const imported = await importGuestSaves(u.id, parsed.data);
  return { ok: true, imported };
}

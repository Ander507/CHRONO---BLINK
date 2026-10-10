"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { gameListingSchema } from "@/lib/validation";
import { enforceRateLimit } from "@/server/rate-limit";
import { HttpError, assertUser } from "@/server/session";
import {
  activateDeveloper,
  createGame,
  createVersionUpload,
  discardVersion,
  getEditableGame,
  previewUrl,
  processVersion,
  submitForReview,
  updateGame,
  uploadCover,
} from "@/server/services/developer";
import { db } from "@/server/db";
import { gameVersions } from "@/server/db/schema";
import { eq } from "drizzle-orm";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function wrap<T extends object>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0] ? `${e.issues[0].path.join(".")}: ${e.issues[0].message}` : "Invalid input" };
    console.error("[developer action]", e);
    return { ok: false, error: "Something went wrong" };
  }
}

const activateSchema = z.object({
  studioName: z.string().trim().min(2).max(60),
  website: z.union([z.literal(""), z.string().trim().url().max(200).startsWith("https://")]).default(""),
  bio: z.string().trim().max(500).default(""),
  agree: z.literal(true, { error: "You must accept the Developer Agreement" }),
});

export async function activateDeveloperAction(input: unknown) {
  return wrap(async () => {
    const u = await assertUser();
    const data = activateSchema.parse(input);
    await activateDeveloper(u, data);
    revalidatePath("/developers", "layout");
    return {};
  });
}

export async function createGameAction(input: unknown) {
  return wrap(async () => {
    const u = await assertUser();
    await enforceRateLimit(`dev:create:${u.id}`, 10, 3600);
    const g = await createGame(u, gameListingSchema.parse(input));
    revalidatePath("/developers", "layout");
    return { id: g.id };
  });
}

export async function updateGameAction(gameId: string, input: unknown) {
  return wrap(async () => {
    const u = await assertUser();
    await updateGame(u, z.string().uuid().parse(gameId), gameListingSchema.parse(input));
    revalidatePath(`/developers/games/${gameId}/edit`);
    return {};
  });
}

export async function uploadCoverAction(gameId: string, form: FormData) {
  return wrap(async () => {
    const u = await assertUser();
    await enforceRateLimit(`dev:cover:${u.id}`, 30, 3600);
    const kind = form.get("kind") === "cover_portrait" ? "cover_portrait" : "cover";
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose an image");
    await uploadCover(u, z.string().uuid().parse(gameId), kind, file);
    revalidatePath(`/developers/games/${gameId}/edit`);
    return {};
  });
}

export async function requestUploadAction(gameId: string, bytes: number, notes: string) {
  return wrap(async () => {
    const u = await assertUser();
    await enforceRateLimit(`dev:upload:${u.id}`, 20, 3600);
    return createVersionUpload(u, z.string().uuid().parse(gameId), z.number().int().parse(bytes), z.string().max(500).parse(notes));
  });
}

export async function processVersionAction(versionId: string) {
  return wrap(async () => {
    const u = await assertUser();
    const r = await processVersion(u, z.string().uuid().parse(versionId));
    revalidatePath("/developers", "layout");
    return { valid: r.ok, errors: r.errors, warnings: r.warnings };
  });
}

export async function previewAction(versionId: string) {
  return wrap(async () => {
    const u = await assertUser();
    const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, z.string().uuid().parse(versionId)) });
    if (!v || !["ready", "in_review", "rejected"].includes(v.status)) throw new HttpError(404, "not_found", "No previewable build");
    await getEditableGame(u, v.gameId).catch(async (e) => {
      // Staff reviewers may preview any submitted build.
      if (u.role === "admin" || u.role === "moderator") return null;
      throw e;
    });
    return { url: previewUrl(v.gameId, v.id) };
  });
}

export async function submitVersionAction(versionId: string) {
  return wrap(async () => {
    const u = await assertUser();
    await submitForReview(u, z.string().uuid().parse(versionId));
    revalidatePath("/developers", "layout");
    return {};
  });
}

export async function discardVersionAction(versionId: string) {
  return wrap(async () => {
    const u = await assertUser();
    await discardVersion(u, z.string().uuid().parse(versionId));
    revalidatePath("/developers", "layout");
    return {};
  });
}

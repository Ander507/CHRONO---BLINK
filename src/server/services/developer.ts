import "server-only";
import { and, count, desc, eq, ne, sql, sum } from "drizzle-orm";
import { db } from "@/server/db";
import { developers, gameAssets, gameVersions, games, user, type GameStatus } from "@/server/db/schema";
import { env, integrations } from "@/server/env";
import { stagingPrefix, type PreviewToken } from "@/server/game-host-policy";
import { contentTypeFor, signToken } from "@/server/storage/driver";
import { HttpError, hasRole, type AppUser } from "@/server/session";
import { audit } from "@/server/audit";
import { storage } from "@/server/services/storage";
import { scanBuffer } from "@/server/uploads/scanner";
import { DEFAULT_ZIP_LIMITS, validateZip } from "@/server/uploads/zip-validator";
import type { GameListingInput } from "@/lib/validation";

export const UPLOAD_QUOTA = {
  maxZipBytes: DEFAULT_ZIP_LIMITS.maxCompressedBytes,
  maxVersionsPerGame: 30,
  maxPendingPerGame: 3,
  maxStorageBytesPerDeveloper: 1024 * 1024 * 1024,
  maxGamesPerDeveloper: 25,
  uploadUrlTtlSeconds: 15 * 60,
};

export async function getDeveloper(userId: string) {
  return db.query.developers.findFirst({ where: eq(developers.userId, userId) });
}

export async function requireDeveloper(u: AppUser) {
  const dev = await getDeveloper(u.id);
  if (!dev) throw new HttpError(403, "not_developer", "Activate your developer account first");
  if (dev.status !== "active") throw new HttpError(403, "suspended", "Your developer account is suspended");
  return dev;
}

export async function activateDeveloper(u: AppUser, input: { studioName: string; website?: string; bio?: string }) {
  if (!u.emailVerified) throw new HttpError(403, "unverified", "Verify your email first");
  const existing = await getDeveloper(u.id);
  if (existing) return existing;
  const [dev] = await db
    .insert(developers)
    .values({ userId: u.id, studioName: input.studioName, website: input.website || null, bio: input.bio ?? "", agreementAcceptedAt: new Date() })
    .returning();
  if (u.role === "user") await db.update(user).set({ role: "developer" }).where(eq(user.id, u.id));
  await audit(u.id, "developer.activate", "developer", dev!.id, { studioName: input.studioName });
  return dev!;
}

/**
 * Upload policy. Untrusted public uploads require a working malware scanner;
 * without one, only admin-trusted developers and staff may upload builds.
 * Every build still goes through validation, sandboxed preview and human
 * review before it can be published.
 */
export function uploadPolicy(u: AppUser, dev: { trusted: boolean; status: string }) {
  if (dev.status !== "active") return { allowed: false, reason: "Developer account suspended." };
  if (hasRole(u, "moderator")) return { allowed: true, reason: null };
  if (dev.trusted) return { allowed: true, reason: null };
  if (integrations.malwareScanner) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "Build uploads are currently limited to verified studios while malware scanning is being set up. Ask the ChronoBlink team to verify your studio.",
  };
}

/** Loads a game the user may edit: its developer, or staff. */
export async function getEditableGame(u: AppUser, gameId: string) {
  const g = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!g) throw new HttpError(404, "not_found", "Game not found");
  if (hasRole(u, "admin")) return g;
  const dev = await getDeveloper(u.id);
  if (!dev || g.developerId !== dev.id) throw new HttpError(404, "not_found", "Game not found");
  return g;
}

export async function listDeveloperGames(devId: string) {
  return db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      status: games.status,
      coverKey: games.coverKey,
      updatedAt: games.updatedAt,
      liveVersionId: games.liveVersionId,
      versions: sql<number>`(select count(*) from game_versions v where v.game_id = "games"."id")::int`,
      latestVersionStatus: sql<string | null>`(select v.status from game_versions v where v.game_id = "games"."id" order by v.version desc limit 1)`,
    })
    .from(games)
    .where(eq(games.developerId, devId))
    .orderBy(desc(games.updatedAt));
}

export async function createGame(u: AppUser, input: GameListingInput) {
  const dev = await requireDeveloper(u);
  const [{ n }] = (await db.select({ n: count() }).from(games).where(eq(games.developerId, dev.id))) as [{ n: number }];
  if (Number(n) >= UPLOAD_QUOTA.maxGamesPerDeveloper) throw new HttpError(409, "quota", "Game limit reached for your account");
  const clash = await db.query.games.findFirst({ where: eq(games.slug, input.slug), columns: { id: true } });
  if (clash) throw new HttpError(409, "slug_taken", "That URL slug is already taken");
  const [g] = await db
    .insert(games)
    .values({ ...input, developerId: dev.id, creditName: dev.studioName, status: "draft" })
    .returning();
  await audit(u.id, "game.create", "game", g!.id, { slug: input.slug });
  return g!;
}

export async function updateGame(u: AppUser, gameId: string, input: GameListingInput) {
  const g = await getEditableGame(u, gameId);
  if (input.slug !== g.slug) {
    if (g.status === "published") throw new HttpError(409, "slug_locked", "The URL of a published game can't change");
    const clash = await db.query.games.findFirst({ where: and(eq(games.slug, input.slug), ne(games.id, g.id)), columns: { id: true } });
    if (clash) throw new HttpError(409, "slug_taken", "That URL slug is already taken");
  }
  await db.update(games).set(input).where(eq(games.id, g.id));
  await audit(u.id, "game.update", "game", g.id, {});
}

const IMAGE_MAGIC: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

/** Cover art upload: ≤ 3 MB PNG/JPEG/WebP, verified by magic bytes (never trust the declared type). */
export async function uploadCover(u: AppUser, gameId: string, kind: "cover" | "cover_portrait", file: File) {
  const g = await getEditableGame(u, gameId);
  if (file.size > 3 * 1024 * 1024) throw new HttpError(413, "too_large", "Images must be 3 MB or smaller");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = IMAGE_MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!type || (type === "image/webp" && buf.subarray(8, 12).toString("ascii") !== "WEBP")) {
    throw new HttpError(415, "bad_type", "Upload a PNG, JPEG or WebP image");
  }
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const key = `media/${g.id}/${kind === "cover" ? "cover" : "portrait"}-${crypto.randomUUID().slice(0, 12)}.${ext}`;
  await storage.put(key, buf, type);
  await db.insert(gameAssets).values({ gameId: g.id, kind, storageKey: key, contentType: type, bytes: buf.length, createdBy: u.id });
  await db
    .update(games)
    .set(kind === "cover" ? { coverKey: key } : { coverPortraitKey: key })
    .where(eq(games.id, g.id));
  return key;
}

export async function developerStorageBytes(devId: string) {
  const [r] = await db
    .select({ total: sum(gameVersions.totalBytes) })
    .from(gameVersions)
    .innerJoin(games, eq(games.id, gameVersions.gameId))
    .where(and(eq(games.developerId, devId), ne(gameVersions.status, "superseded")));
  return Number(r?.total ?? 0);
}

/** Step 1: reserve a version and hand back a short-lived signed URL for a direct upload. */
export async function createVersionUpload(u: AppUser, gameId: string, bytes: number, notes: string) {
  const g = await getEditableGame(u, gameId);
  const dev = g.developerId ? await db.query.developers.findFirst({ where: eq(developers.id, g.developerId) }) : null;
  const policy = dev ? uploadPolicy(u, dev) : hasRole(u, "admin") ? { allowed: true, reason: null } : { allowed: false, reason: "No developer account" };
  if (!policy.allowed) throw new HttpError(403, "uploads_restricted", policy.reason ?? "Uploads restricted");
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > UPLOAD_QUOTA.maxZipBytes) {
    throw new HttpError(413, "too_large", `Builds must be between 1 byte and ${UPLOAD_QUOTA.maxZipBytes / 1048576} MB`);
  }
  const versions = await db.select({ status: gameVersions.status }).from(gameVersions).where(eq(gameVersions.gameId, g.id));
  if (versions.length >= UPLOAD_QUOTA.maxVersionsPerGame) throw new HttpError(409, "quota", "Version limit reached for this game");
  const pending = versions.filter((v) => ["pending_upload", "processing", "ready", "in_review"].includes(v.status)).length;
  if (pending >= UPLOAD_QUOTA.maxPendingPerGame) throw new HttpError(409, "quota", "Finish or discard pending builds before uploading another");
  if (dev && (await developerStorageBytes(dev.id)) + bytes > UPLOAD_QUOTA.maxStorageBytesPerDeveloper) {
    throw new HttpError(409, "quota", "Storage quota exceeded");
  }
  const next = (versions.length ? Math.max(...(await db.select({ v: gameVersions.version }).from(gameVersions).where(eq(gameVersions.gameId, g.id))).map((x) => x.v)) : 0) + 1;
  const [v] = await db
    .insert(gameVersions)
    .values({ gameId: g.id, version: next, status: "pending_upload", notes: notes.slice(0, 500), createdBy: u.id })
    .returning();
  const uploadKey = `uploads/${v!.id}.zip`;
  await db.update(gameVersions).set({ uploadKey }).where(eq(gameVersions.id, v!.id));
  const signed = await storage.signedUpload(uploadKey, bytes, "application/zip", UPLOAD_QUOTA.uploadUrlTtlSeconds);
  await audit(u.id, "version.upload_url", "game_version", v!.id, { gameId: g.id, bytes });
  return { versionId: v!.id, version: next, upload: signed };
}

/** Step 2: validate + scan the uploaded archive and extract it to private staging storage. */
export async function processVersion(u: AppUser, versionId: string) {
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  if (!v) throw new HttpError(404, "not_found", "Build not found");
  const g = await getEditableGame(u, v.gameId);
  if (v.status !== "pending_upload") throw new HttpError(409, "bad_state", "This build was already processed");
  const [claimed] = await db
    .update(gameVersions)
    .set({ status: "processing" })
    .where(and(eq(gameVersions.id, v.id), eq(gameVersions.status, "pending_upload")))
    .returning();
  if (!claimed) throw new HttpError(409, "bad_state", "This build is already being processed");

  const fail = async (errors: string[], warnings: string[] = [], scan?: { status: "infected" | "error"; details: string }) => {
    await db
      .update(gameVersions)
      .set({
        status: "invalid",
        validationReport: { ok: false, errors, warnings, fileCount: 0, totalBytes: 0, compressedBytes: 0 },
        ...(scan ? { scanStatus: scan.status, scanDetails: scan.details } : {}),
      })
      .where(eq(gameVersions.id, v.id));
    if (v.uploadKey) await storage.delete(v.uploadKey).catch(() => {});
    await audit(u.id, "version.invalid", "game_version", v.id, { errors: errors.slice(0, 5) });
    return { ok: false as const, errors, warnings };
  };

  const zip = v.uploadKey ? await storage.getBuffer(v.uploadKey, UPLOAD_QUOTA.maxZipBytes + 1) : null;
  if (!zip) return fail(["Upload not found or larger than the limit. Upload the file again."]);

  const dev = g.developerId ? await db.query.developers.findFirst({ where: eq(developers.id, g.developerId) }) : null;
  let scanStatus: "clean" | "skipped_trusted" = "skipped_trusted";
  let scanDetails = "Uploaded by a trusted developer or staff; no scanner configured";
  if (integrations.malwareScanner) {
    const scan = await scanBuffer(zip);
    if (scan.status === "infected") return fail(["Malware scanner flagged this archive."], [], { status: "infected", details: scan.details });
    if (scan.status === "error") return fail(["Malware scan could not complete; try again later."], [], { status: "error", details: scan.details });
    scanStatus = "clean";
    scanDetails = scan.details;
  } else if (!(hasRole(u, "moderator") || dev?.trusted)) {
    return fail(["Uploads require a malware scanner or a verified studio."]);
  }

  const report = await validateZip(zip);
  if (!report.ok) return fail(report.errors, report.warnings);

  const prefix = stagingPrefix(g.id, v.id);
  for (const f of report.files) await storage.put(`${prefix}/${f.path}`, f.data, contentTypeFor(f.path));
  await db
    .update(gameVersions)
    .set({
      status: "ready",
      storagePrefix: prefix,
      fileCount: report.files.length,
      totalBytes: report.totalBytes,
      scanStatus,
      scanDetails,
      validationReport: {
        ok: true,
        errors: [],
        warnings: report.warnings,
        fileCount: report.files.length,
        totalBytes: report.totalBytes,
        compressedBytes: report.compressedBytes,
        files: report.files.slice(0, 200).map((f) => f.path),
      },
    })
    .where(eq(gameVersions.id, v.id));
  await storage.delete(v.uploadKey!).catch(() => {});
  await audit(u.id, "version.ready", "game_version", v.id, { files: report.files.length, bytes: report.totalBytes });
  return { ok: true as const, errors: [], warnings: report.warnings };
}

/** Signed, expiring URL that lets the game host serve an unreviewed build from staging. */
export function previewUrl(gameId: string, versionId: string, ttlSeconds = 30 * 60) {
  const token = signToken(env.PLATFORM_SIGNING_SECRET, { g: gameId, v: versionId, exp: Math.floor(Date.now() / 1000) + ttlSeconds } satisfies PreviewToken);
  return `${env.GAME_ORIGIN}/p/${encodeURIComponent(token)}/index.html`;
}

export async function submitForReview(u: AppUser, versionId: string) {
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  if (!v) throw new HttpError(404, "not_found", "Build not found");
  const g = await getEditableGame(u, v.gameId);
  if (v.status !== "ready") throw new HttpError(409, "bad_state", "Only validated builds can be submitted");
  if (!g.coverKey) throw new HttpError(409, "missing_cover", "Upload cover art before submitting");
  await db.update(gameVersions).set({ status: "in_review", submittedAt: new Date() }).where(eq(gameVersions.id, v.id));
  if (g.status === "draft" || g.status === "rejected") await db.update(games).set({ status: "in_review" as GameStatus }).where(eq(games.id, g.id));
  await audit(u.id, "version.submit", "game_version", v.id, { gameId: g.id });
}

/** Discard a build that hasn't gone live: deletes its staging files. */
export async function discardVersion(u: AppUser, versionId: string) {
  const v = await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, versionId) });
  if (!v) throw new HttpError(404, "not_found", "Build not found");
  await getEditableGame(u, v.gameId);
  if (["live", "approved", "superseded"].includes(v.status)) throw new HttpError(409, "bad_state", "Published builds can't be discarded");
  await storage.deletePrefix(stagingPrefix(v.gameId, v.id)).catch(() => 0);
  if (v.uploadKey) await storage.delete(v.uploadKey).catch(() => {});
  await db.delete(gameVersions).where(eq(gameVersions.id, v.id));
  await audit(u.id, "version.discard", "game_version", v.id, {});
}

export async function versionsForGame(gameId: string) {
  return db.select().from(gameVersions).where(eq(gameVersions.gameId, gameId)).orderBy(desc(gameVersions.version));
}

export async function developerGameIds(devId: string) {
  return (await db.select({ id: games.id }).from(games).where(eq(games.developerId, devId))).map((r) => r.id);
}


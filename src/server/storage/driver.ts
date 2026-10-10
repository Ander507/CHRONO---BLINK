/**
 * Object storage abstraction for game builds, upload staging and media.
 *
 * Deliberately free of Next.js / app imports so the standalone game host
 * (game-host/server.ts) can use it too.
 *
 * Key layout:
 *   uploads/<versionId>.zip                raw developer uploads (private)
 *   staging/<gameId>/<versionId>/<path>    extracted, not yet approved (private; signed preview only)
 *   games/<gameId>/<versionId>/<path>      approved builds, served by the game origin
 *   media/<gameId>/<file>                  cover art, served by the app
 */
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StoredObject = { body: Readable; size: number; contentType: string };
export type SignedUpload = { url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string };

export interface StorageDriver {
  readonly kind: "local" | "r2";
  put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  getBuffer(key: string, maxBytes: number): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  copyPrefix(from: string, to: string): Promise<number>;
  /** Short-lived URL a browser can PUT an upload to directly. */
  signedUpload(key: string, bytes: number, contentType: string, ttlSeconds: number): Promise<SignedUpload>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export function assertSafeKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//") || key.length > 1024) {
    throw new Error(`unsafe storage key: ${key}`);
  }
  return key;
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  wasm: "application/wasm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  bin: "application/octet-stream",
  data: "application/octet-stream",
  unityweb: "application/octet-stream",
  atlas: "text/plain; charset=utf-8",
  fnt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};
export function contentTypeFor(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
export const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME));

// ── signing helpers (shared by app and game host) ───────────────────────────

export function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}
export function verifyHmac(secret: string, data: string, sig: string): boolean {
  const expected = Buffer.from(hmac(secret, data));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** token = base64url(json payload) + "." + hmac */
export function signToken(secret: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(secret, body)}`;
}
export function readToken<T extends { exp: number }>(secret: string, token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyHmac(secret, body, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── local filesystem driver ─────────────────────────────────────────────────

export class LocalStorageDriver implements StorageDriver {
  readonly kind = "local" as const;
  constructor(
    private root: string,
    private appUrl: string,
    private signingSecret: string,
  ) {}

  private file(key: string) {
    const full = path.resolve(this.root, assertSafeKey(key));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("path escapes storage root");
    return full;
  }

  async put(key: string, body: Buffer | Uint8Array, _contentType: string) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string): Promise<StoredObject | null> {
    try {
      const f = this.file(key);
      const s = await stat(f);
      if (!s.isFile()) return null;
      return { body: createReadStream(f), size: s.size, contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }
  async getBuffer(key: string, maxBytes: number) {
    try {
      const f = this.file(key);
      const s = await stat(f);
      if (!s.isFile() || s.size > maxBytes) return null;
      return await readFile(f);
    } catch {
      return null;
    }
  }
  async exists(key: string) {
    try {
      return (await stat(this.file(key))).isFile();
    } catch {
      return false;
    }
  }
  async list(prefix: string) {
    const base = this.file(prefix.replace(/\/$/, ""));
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.isFile()) out.push(path.relative(this.root, p).split(path.sep).join("/"));
      }
    };
    await walk(base);
    return out.sort();
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    await rm(this.file(prefix.replace(/\/$/, "")), { recursive: true, force: true });
    return keys.length;
  }
  async copyPrefix(from: string, to: string) {
    const keys = await this.list(from);
    for (const k of keys) {
      const rel = k.slice(from.replace(/\/$/, "").length + 1);
      const dest = this.file(`${to.replace(/\/$/, "")}/${rel}`);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, await readFile(this.file(k)));
    }
    return keys.length;
  }
  async signedUpload(key: string, bytes: number, contentType: string, ttlSeconds: number): Promise<SignedUpload> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = signToken(this.signingSecret, { k: assertSafeKey(key), b: bytes, ct: contentType, exp });
    return {
      url: `${this.appUrl}/api/uploads/local?token=${encodeURIComponent(token)}`,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }
}

// ── Cloudflare R2 (S3 API) driver ──────────────────────────────────────────

export class R2StorageDriver implements StorageDriver {
  readonly kind = "r2" as const;
  private s3: S3Client;
  constructor(
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
    private bucket: string,
  ) {
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  async put(key: string, body: Buffer | Uint8Array, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), Body: body, ContentType: contentType }));
  }
  async get(key: string): Promise<StoredObject | null> {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
      if (!r.Body) return null;
      return { body: r.Body as Readable, size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? contentTypeFor(key) };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  async getBuffer(key: string, maxBytes: number) {
    const o = await this.get(key);
    if (!o || o.size > maxBytes) {
      o?.body.destroy();
      return null;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of o.body) {
      total += (c as Buffer).length;
      if (total > maxBytes) {
        o.body.destroy();
        return null;
      }
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks);
  }
  async exists(key: string) {
    const o = await this.get(key);
    o?.body.destroy();
    return Boolean(o);
  }
  async list(prefix: string) {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out.sort();
  }
  async delete(key: string) {
    await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: assertSafeKey(key) }] } }));
  }
  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
      await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch } }));
    }
    return keys.length;
  }
  async copyPrefix(from: string, to: string) {
    const keys = await this.list(from);
    for (const k of keys) {
      const rel = k.slice(from.replace(/\/$/, "").length + 1);
      await this.s3.send(
        new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${encodeURI(k)}`, Key: `${to.replace(/\/$/, "")}/${rel}` }),
      );
    }
    return keys.length;
  }
  async signedUpload(key: string, bytes: number, contentType: string, ttlSeconds: number): Promise<SignedUpload> {
    // ContentLength is part of the signature, so the browser can't upload a larger body.
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), ContentType: contentType, ContentLength: bytes });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: ttlSeconds, signableHeaders: new Set(["content-length", "content-type"]) });
    return {
      url,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }
}

export function createStorageFromEnv(e: NodeJS.ProcessEnv = process.env): StorageDriver {
  const driver = e.STORAGE_DRIVER ?? "local";
  if (driver === "r2") {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = e;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      throw new Error("STORAGE_DRIVER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET");
    }
    return new R2StorageDriver(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET);
  }
  return new LocalStorageDriver(
    path.resolve(e.STORAGE_LOCAL_ROOT ?? ".data/storage"),
    e.APP_URL ?? "http://localhost:3000",
    e.PLATFORM_SIGNING_SECRET ?? "dev-only-signing-secret-change-me",
  );
}

/**
 * ChronoBlink game host — the isolated origin that serves untrusted game code.
 *
 * Runs as its own process on its own origin (GAME_ORIGIN). It has no database
 * access, no auth cookies and no knowledge of users: it only maps URLs to
 * objects in storage and attaches strict security headers.
 *
 *   GET /sdk/v1/chronoblink.js          the SDK bundle
 *   GET /g/<gameId>/<versionId>/<path>  approved builds (immutable, cacheable)
 *   GET /p/<token>/<path>               unreviewed builds via short-lived signed preview token
 *   GET /healthz
 *
 * In production this role is played by the Cloudflare Worker in
 * deploy/cloudflare-game-worker, which applies the same policy to R2 objects.
 */
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStorageFromEnv, readToken } from "../src/server/storage/driver";
import {
  GAME_META_FILE,
  UUID_RE,
  gameResponseHeaders,
  publishedPrefix,
  safeGamePath,
  stagingPrefix,
  type GameMeta,
  type PreviewToken,
} from "../src/server/game-host-policy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appOrigin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
const gameOrigin = new URL(process.env.GAME_ORIGIN ?? "http://127.0.0.1:3001").origin;
const port = Number(process.env.GAME_HOST_PORT ?? new URL(gameOrigin).port ?? 3001);
const signingSecret = process.env.PLATFORM_SIGNING_SECRET ?? "dev-only-signing-secret-change-me";
const storage = createStorageFromEnv();

if (new URL(appOrigin).host === new URL(gameOrigin).host) {
  console.error("[game-host] GAME_ORIGIN must differ from APP_URL — refusing to serve untrusted code on the app origin.");
  process.exit(1);
}

const metaCache = new Map<string, GameMeta>();
async function loadMeta(prefix: string, cache: boolean): Promise<GameMeta> {
  const hit = cache ? metaCache.get(prefix) : undefined;
  if (hit) return hit;
  const buf = await storage.getBuffer(`${prefix}/${GAME_META_FILE}`, 16 * 1024);
  let meta: GameMeta = { cspExtraOrigins: [] };
  if (buf) {
    try {
      const parsed = JSON.parse(buf.toString("utf8")) as Partial<GameMeta>;
      meta = { cspExtraOrigins: Array.isArray(parsed.cspExtraOrigins) ? parsed.cspExtraOrigins.map(String) : [] };
    } catch {
      /* malformed meta → no extras */
    }
  }
  if (cache) metaCache.set(prefix, meta);
  return meta;
}

let sdkBundle: Buffer | null = null;
async function sdk(): Promise<Buffer | null> {
  if (sdkBundle && process.env.NODE_ENV === "production") return sdkBundle;
  try {
    sdkBundle = await readFile(path.join(root, "packages/sdk/dist/chronoblink.js"));
  } catch {
    sdkBundle = null;
  }
  return sdkBundle;
}

function send(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function serveObject(req: IncomingMessage, res: ServerResponse, prefix: string, rel: string, immutable: boolean) {
  const obj = await storage.get(`${prefix}/${rel}`);
  if (!obj) return send(res, 404, "Not found");
  const meta = await loadMeta(prefix, immutable);
  const headers = gameResponseHeaders({
    appOrigin,
    gameOrigin,
    contentType: obj.contentType,
    extraOrigins: meta.cspExtraOrigins,
    immutable,
  });
  res.writeHead(200, { ...headers, "content-length": String(obj.size) });
  if (req.method === "HEAD") {
    obj.body.destroy();
    return res.end();
  }
  obj.body.pipe(res);
  obj.body.on("error", () => res.destroy());
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    const url = new URL(req.url ?? "/", gameOrigin);
    const parts = url.pathname.split("/").slice(1);

    if (url.pathname === "/healthz") return send(res, 200, "ok");

    if (url.pathname === "/sdk/v1/chronoblink.js") {
      const js = await sdk();
      if (!js) return send(res, 503, "SDK not built — run `pnpm sdk:build`");
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "x-content-type-options": "nosniff",
        "access-control-allow-origin": "*",
        "cross-origin-resource-policy": "cross-origin",
        "cache-control": "public, max-age=300",
      });
      return res.end(req.method === "HEAD" ? undefined : js);
    }

    if (parts[0] === "g" && parts.length >= 3) {
      const [, gameId = "", versionId = "", ...rest] = parts;
      if (!UUID_RE.test(gameId) || !UUID_RE.test(versionId)) return send(res, 404, "Not found");
      const rel = safeGamePath(rest);
      if (!rel) return send(res, 400, "Bad path");
      return serveObject(req, res, publishedPrefix(gameId, versionId), rel, true);
    }

    if (parts[0] === "p" && parts.length >= 2) {
      const [, token = "", ...rest] = parts;
      const t = readToken<PreviewToken>(signingSecret, decodeURIComponent(token));
      if (!t || !UUID_RE.test(t.g) || !UUID_RE.test(t.v)) return send(res, 403, "Preview link expired or invalid");
      const rel = safeGamePath(rest);
      if (!rel) return send(res, 400, "Bad path");
      return serveObject(req, res, stagingPrefix(t.g, t.v), rel, false);
    }

    return send(res, 404, "Not found");
  } catch (err) {
    console.error("[game-host]", err);
    if (!res.headersSent) send(res, 500, "Internal error");
    else res.destroy();
  }
});

server.listen(port, new URL(gameOrigin).hostname === "127.0.0.1" ? "127.0.0.1" : undefined, () => {
  console.log(`[game-host] serving games on ${gameOrigin} (storage: ${storage.kind}, frame-ancestors ${appOrigin})`);
});

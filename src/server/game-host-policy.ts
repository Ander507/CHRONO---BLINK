/**
 * Security policy for the untrusted game origin. Pure functions with no Node or
 * Next.js imports, shared by the local game host (game-host/server.ts), the
 * Cloudflare Worker (deploy/cloudflare-game-worker) and tests.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Only https origins on an allowlist-friendly shape may be added to a game's CSP. */
export const EXTRA_ORIGIN_RE = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/;

export const GAME_META_FILE = ".chronoblink.json";
export type GameMeta = { cspExtraOrigins: string[] };

/** iframe sandbox tokens. No allow-same-origin: every game gets an opaque origin. */
export const IFRAME_SANDBOX = "allow-scripts allow-pointer-lock";
/** iframe `allow` (Permissions Policy). Fullscreen is handled by the platform, not the frame. */
export const IFRAME_ALLOW = "autoplay; gamepad; pointer-lock";

export function gameCsp(opts: { appOrigin: string; gameOrigin: string; extraOrigins?: string[] }): string {
  const self = `'self' ${opts.gameOrigin}`;
  const extra = (opts.extraOrigins ?? []).filter((o) => EXTRA_ORIGIN_RE.test(o)).join(" ");
  const withExtra = (s: string) => (extra ? `${s} ${extra}` : s);
  return [
    `default-src ${self}`,
    `script-src ${self} 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:`,
    withExtra(`style-src ${self} 'unsafe-inline'`),
    `img-src ${self} data: blob:`,
    withExtra(`font-src ${self} data:`),
    `media-src ${self} data: blob:`,
    `connect-src ${self} data: blob:`,
    `worker-src ${self} blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'none'`,
    `frame-ancestors ${opts.appOrigin}`,
    // Defence in depth: even if someone opens a game URL top-level it runs with an opaque origin.
    `sandbox allow-scripts allow-pointer-lock`,
  ].join("; ");
}

export const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), publickey-credentials-get=(), clipboard-read=()";

export function gameResponseHeaders(opts: {
  appOrigin: string;
  gameOrigin: string;
  contentType: string;
  extraOrigins?: string[];
  immutable: boolean;
}): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": opts.contentType,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": PERMISSIONS_POLICY,
    // Opaque-origin documents fetch their own assets cross-origin; nothing here is credentialed.
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    "cache-control": opts.immutable ? "public, max-age=31536000, immutable" : "no-store",
  };
  if (opts.contentType.startsWith("text/html") || opts.contentType.startsWith("image/svg")) {
    h["content-security-policy"] = gameCsp(opts);
  }
  return h;
}

/**
 * Normalises a request path inside a game build. Returns null for anything
 * that could escape the build directory or address hidden metadata.
 */
export function safeGamePath(segments: string[]): string | null {
  const out: string[] = [];
  for (const raw of segments) {
    let s: string;
    try {
      s = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (s === "" || s === ".") continue;
    if (s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")) return null;
    out.push(s);
  }
  if (out.length === 0) return "index.html";
  const p = out.join("/");
  if (p === GAME_META_FILE) return null;
  return p;
}

/** Storage prefix for an approved build. */
export const publishedPrefix = (gameId: string, versionId: string) => `games/${gameId}/${versionId}`;
/** Storage prefix for an unreviewed build. */
export const stagingPrefix = (gameId: string, versionId: string) => `staging/${gameId}/${versionId}`;

export type PreviewToken = { g: string; v: string; exp: number };

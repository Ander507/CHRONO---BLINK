import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce-based Content Security Policy for the platform origin.
 * Untrusted games never run here: they're framed from GAME_ORIGIN, which is
 * the only frame-src we allow besides Turnstile.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const gameOrigin = process.env.NEXT_PUBLIC_GAME_ORIGIN ?? process.env.GAME_ORIGIN ?? "http://127.0.0.1:3001";
  const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";
  const extraScript = process.env.CSP_EXTRA_SCRIPT_SRC ? ` ${process.env.CSP_EXTRA_SCRIPT_SRC}` : "";
  const extraFrame = process.env.CSP_EXTRA_FRAME_SRC ? ` ${process.env.CSP_EXTRA_FRAME_SRC}` : "";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${turnstile}${extraScript}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:${process.env.MEDIA_PUBLIC_BASE_URL ? ` ${new URL(process.env.MEDIA_PUBLIC_BASE_URL).origin}` : ""}`,
    `font-src 'self' data:`,
    `connect-src 'self'${turnstile}${dev ? " ws: wss:" : ""}${process.env.STORAGE_DRIVER === "r2" ? " https://*.r2.cloudflarestorage.com" : ""}`,
    `frame-src ${gameOrigin}${turnstile}${extraFrame}`,
    `media-src 'self'`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|media|_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/server/env";
import { HttpError } from "@/server/session";

export function clientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  if (err instanceof ZodError) {
    return json({ error: { code: "invalid_request", message: err.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  console.error("[api]", err);
  return json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

/**
 * CSRF defence for cookie-authenticated JSON endpoints: browsers always send
 * Origin on cross-site POSTs, so we require it to be our own origin.
 * (Server Actions get the same check from Next.js itself.)
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new URL(env.APP_URL).origin;
  if (!origin || origin !== allowed) throw new HttpError(403, "bad_origin", "Cross-origin request rejected");
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "too_large", "Request body too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "Request body too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "invalid_json", "Malformed JSON");
  }
}

/**
 * Platform side of the SDK protocol: validation of messages coming from the
 * untrusted game frame. Kept framework-free so it can be unit tested.
 */
import { z } from "zod";
import { LIMITS, METHODS, PROTOCOL_VERSION, type Method } from "@chronoblink/sdk/protocol";

export const helloSchema = z.object({
  cbsdk: z.literal(1),
  kind: z.literal("hello"),
  sdkVersion: z.string().max(32),
  nonce: z.string().min(8).max(64),
});

const empty = z.object({}).strict();
const props = z.record(z.string().max(32), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional();

export const paramSchemas: { [M in Method]: z.ZodType } = {
  init: z.object({ sdkVersion: z.string().max(32) }),
  "loading.progress": z.object({ progress: z.number().min(0).max(1) }),
  "loading.done": empty,
  "gameplay.start": empty,
  "gameplay.stop": empty,
  "score.submit": z.object({
    leaderboard: z.string().regex(LIMITS.leaderboardKeyPattern),
    score: z.number().int().min(0).max(LIMITS.maxScore),
  }),
  "achievement.unlock": z.object({ key: z.string().regex(LIMITS.achievementKeyPattern) }),
  "data.save": z.object({ key: z.string().regex(LIMITS.saveKeyPattern), value: z.unknown() }),
  "data.load": z.object({ key: z.string().regex(LIMITS.saveKeyPattern) }),
  "data.delete": z.object({ key: z.string().regex(LIMITS.saveKeyPattern) }),
  "ad.request": z.object({ type: z.enum(["midgame", "rewarded"]) }),
  "fullscreen.request": empty,
  "analytics.track": z.object({ name: z.string().regex(LIMITS.eventNamePattern), props }),
  "error.report": z.object({ message: z.string().max(500), stack: z.string().max(2000).optional() }),
};

export type ParsedRequest = { id: number; method: Method; params: unknown };

/** Returns a validated request, or an error describing why it was rejected. */
export function parseRequest(data: unknown): { ok: true; req: ParsedRequest } | { ok: false; id: number | null; code: string } {
  if (!data || typeof data !== "object") return { ok: false, id: null, code: "malformed" };
  const d = data as { id?: unknown; method?: unknown; params?: unknown };
  const id = typeof d.id === "number" && Number.isInteger(d.id) && d.id > 0 && d.id < 2 ** 31 ? d.id : null;
  if (id === null) return { ok: false, id: null, code: "malformed" };
  if (typeof d.method !== "string" || !(METHODS as readonly string[]).includes(d.method)) return { ok: false, id, code: "unknown_method" };
  const method = d.method as Method;
  const parsed = paramSchemas[method].safeParse(d.params ?? {});
  if (!parsed.success) return { ok: false, id, code: "invalid_params" };
  if (method === "data.save") {
    const size = JSON.stringify((parsed.data as { value: unknown }).value ?? null).length;
    if (size > LIMITS.saveMaxBytes) return { ok: false, id, code: "too_large" };
  }
  return { ok: true, req: { id, method, params: parsed.data } };
}

export function connectMessage(nonce: string) {
  return { cbsdk: 1 as const, kind: "connect" as const, protocol: PROTOCOL_VERSION, nonce };
}

/** Sliding-window limiter for messages from one game frame. */
export class MessageBudget {
  private hits = new Map<string, number[]>();
  constructor(private limits: Partial<Record<Method | "*", [count: number, windowMs: number]>>) {}
  allow(method: Method, now = Date.now()): boolean {
    for (const key of ["*", method] as const) {
      const lim = this.limits[key];
      if (!lim) continue;
      const list = (this.hits.get(key) ?? []).filter((t) => now - t < lim[1]);
      if (list.length >= lim[0]) {
        this.hits.set(key, list);
        return false;
      }
      list.push(now);
      this.hits.set(key, list);
    }
    return true;
  }
}

export const DEFAULT_BUDGET = {
  "*": [60, 1000],
  "score.submit": [4, 10_000],
  "achievement.unlock": [10, 10_000],
  "data.save": [20, 10_000],
  "data.load": [40, 10_000],
  "analytics.track": [30, 10_000],
  "error.report": [5, 10_000],
  "ad.request": [3, 60_000],
  "gameplay.start": [10, 10_000],
} as const satisfies Partial<Record<Method | "*", [number, number]>>;

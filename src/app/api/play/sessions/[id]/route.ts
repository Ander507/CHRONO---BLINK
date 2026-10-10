import { z } from "zod";
import { LIMITS } from "@chronoblink/sdk/protocol";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getCurrentUser, HttpError } from "@/server/session";
import { recordAdOutcome, requestGameAd } from "@/server/services/ads";
import { ingestEvents } from "@/server/services/analytics";
import {
  authorizeSession,
  deleteCloud,
  endRun,
  heartbeat,
  loadCloud,
  saveCloud,
  startRun,
  submitScore,
  unlockGameAchievement,
} from "@/server/services/play";

const props = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional();

const op = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("heartbeat"),
    activeSeconds: z.number().min(0).max(600),
    loadState: z.enum(["loaded", "failed"]).optional(),
    loadMs: z.number().min(0).max(600_000).optional(),
    ended: z.boolean().optional(),
  }),
  z.object({ op: z.literal("run.start") }),
  z.object({ op: z.literal("run.end") }),
  z.object({
    op: z.literal("score"),
    leaderboard: z.string().regex(LIMITS.leaderboardKeyPattern),
    score: z.number().int().min(0).max(LIMITS.maxScore),
  }),
  z.object({ op: z.literal("achievement"), key: z.string().regex(LIMITS.achievementKeyPattern) }),
  z.object({ op: z.literal("save"), key: z.string().regex(LIMITS.saveKeyPattern), value: z.unknown() }),
  z.object({ op: z.literal("load"), key: z.string().regex(LIMITS.saveKeyPattern) }),
  z.object({ op: z.literal("delete"), key: z.string().regex(LIMITS.saveKeyPattern) }),
  z.object({ op: z.literal("ad.request"), type: z.enum(["midgame", "rewarded"]), consent: z.boolean() }),
  z.object({ op: z.literal("ad.outcome"), type: z.enum(["midgame", "rewarded"]), event: z.enum(["started", "completed", "failed"]) }),
  z.object({
    op: z.literal("events"),
    events: z
      .array(z.object({ eventId: z.string().uuid(), name: z.string().regex(/^(sdk:)?[a-z0-9_.:-]{1,48}$/), props }))
      .max(20),
  }),
]);

/** Per-op budgets per session per minute. Generous for real games, tight for scripts. */
const BUDGET: Record<z.infer<typeof op>["op"], number> = {
  heartbeat: 12,
  "run.start": 30,
  "run.end": 30,
  score: 15,
  achievement: 30,
  save: 60,
  load: 120,
  delete: 30,
  "ad.request": 10,
  "ad.outcome": 20,
  events: 30,
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "not_found");
    const token = req.headers.get("x-play-token");
    if (!token) throw new HttpError(401, "invalid_session", "Missing play token");
    const input = op.parse(await readJson(req, 24 * 1024));
    await enforceRateLimit(`play:${id}:${input.op}`, BUDGET[input.op], 60);
    const user = await getCurrentUser();
    const s = await authorizeSession(id, token, user);

    switch (input.op) {
      case "heartbeat":
        return json(await heartbeat(s, input));
      case "run.start":
        return json(await startRun(s));
      case "run.end": {
        const r = await endRun(s);
        return json({ ended: r.ended, unlocked: "unlocked" in r ? (r.unlocked ?? []) : [] });
      }
      case "score":
        return json(await submitScore(s, input));
      case "achievement":
        return json(await unlockGameAchievement(s, input.key));
      case "save":
        return json(await saveCloud(s, input.key, input.value));
      case "load":
        return json(await loadCloud(s, input.key));
      case "delete":
        return json(await deleteCloud(s, input.key));
      case "ad.request":
        return json(await requestGameAd(s, input.type, input.consent));
      case "ad.outcome":
        await recordAdOutcome(s, input.type, input.event);
        return json({ ok: true });
      case "events": {
        const n = await ingestEvents(
          input.events.map((e) => ({ ...e, gameId: s.gameId, sessionId: s.id })),
          s.userId,
        );
        return json({ stored: n });
      }
    }
  } catch (e) {
    return errorResponse(e);
  }
}

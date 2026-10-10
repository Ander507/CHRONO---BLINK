import { z } from "zod";
import { assertSameOrigin, clientIp, errorResponse, json, readJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";
import { PLATFORM_EVENTS, ingestEvents } from "@/server/services/analytics";

const body = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().uuid(),
        name: z.enum(PLATFORM_EVENTS),
        gameId: z.string().uuid().nullish(),
        props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      }),
    )
    .min(1)
    .max(25),
});

/**
 * Batched first-party analytics from the platform UI. The client only sends
 * these after the visitor accepted analytics cookies (see ConsentProvider).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await enforceRateLimit(`analytics:${clientIp(req.headers)}`, 120, 60);
    const { events } = body.parse(await readJson(req, 32 * 1024));
    const user = await getCurrentUser();
    const stored = await ingestEvents(events, user?.id ?? null);
    return json({ stored });
  } catch (e) {
    return errorResponse(e);
  }
}

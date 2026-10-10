import { z } from "zod";
import { assertSameOrigin, clientIp, errorResponse, json, readJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";
import { createPlaySession, playerForSdk } from "@/server/services/play";

const body = z.object({
  slug: z.string().min(1).max(64),
  device: z.enum(["desktop", "mobile", "tablet"]).default("desktop"),
  /** Only sent when the visitor consented to analytics. */
  anonId: z.string().uuid().nullish(),
});

/** Creates a play session for /play/[slug]. Returns the bearer token only once. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await enforceRateLimit(`session:${clientIp(req.headers)}`, 40, 600);
    const input = body.parse(await readJson(req, 2048));
    const user = await getCurrentUser();
    const s = await createPlaySession({ gameSlug: input.slug, user, anonId: input.anonId ?? null, device: input.device });
    return json({ ...s, player: await playerForSdk(user) });
  } catch (e) {
    return errorResponse(e);
  }
}

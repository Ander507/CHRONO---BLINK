import { clientIp, errorResponse, json } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { gamesBySlugs } from "@/server/services/catalog";

/** Card data for a list of slugs — used by guest "Continue playing" (history lives on the device). */
export async function GET(req: Request) {
  try {
    await enforceRateLimit(`cards:${clientIp(req.headers)}`, 60, 60);
    const slugs = (new URL(req.url).searchParams.get("slugs") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]{1,64}$/.test(s))
      .slice(0, 12);
    return json({ games: await gamesBySlugs(slugs) });
  } catch (e) {
    return errorResponse(e);
  }
}

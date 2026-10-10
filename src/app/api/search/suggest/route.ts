import { clientIp, errorResponse, json } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { searchSuggestions } from "@/server/services/catalog";

export async function GET(req: Request) {
  try {
    await enforceRateLimit(`suggest:${clientIp(req.headers)}`, 120, 60);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return json({ results: await searchSuggestions(q) }, { headers: { "cache-control": "public, max-age=30" } });
  } catch (e) {
    return errorResponse(e);
  }
}

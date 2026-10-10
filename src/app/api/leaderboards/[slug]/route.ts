import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { games, leaderboardDefinitions } from "@/server/db/schema";
import { clientIp, errorResponse, json } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getCurrentUser, HttpError } from "@/server/session";
import { PERIODS, getPlayerStanding, getTopScores } from "@/server/services/leaderboards";

const query = z.object({
  period: z.enum(PERIODS).default("all"),
  board: z.string().regex(/^[a-z0-9_-]{1,32}$/).default("highscore"),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await enforceRateLimit(`lb:${clientIp(req.headers)}`, 120, 60);
    const { slug } = await ctx.params;
    const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const [row] = await db
      .select({ def: leaderboardDefinitions })
      .from(leaderboardDefinitions)
      .innerJoin(games, eq(games.id, leaderboardDefinitions.gameId))
      .where(and(eq(games.slug, slug), eq(games.status, "published"), eq(leaderboardDefinitions.key, q.board), eq(leaderboardDefinitions.active, true)));
    if (!row) throw new HttpError(404, "not_found", "Leaderboard not found");
    const user = await getCurrentUser();
    const [rows, me] = await Promise.all([
      getTopScores(row.def.id, q.period, q.limit),
      user ? getPlayerStanding(row.def.id, user.id, q.period) : Promise.resolve(null),
    ]);
    return json({
      board: { key: row.def.key, title: row.def.title, verification: row.def.verification },
      period: q.period,
      rows: rows.map((r) => ({ ...r, isMe: r.userId === user?.id })),
      me,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  account,
  achievementUnlocks,
  achievements,
  challengeProgress,
  cloudSaves,
  developers,
  favorites,
  gameReports,
  gameRuns,
  gameSessions,
  leaderboardEntries,
  profiles,
  session,
  user,
  xpTransactions,
} from "@/server/db/schema";
import { errorResponse } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUser } from "@/server/session";

/** GDPR-style data export (Art. 15/20): everything we store about the signed-in user, as JSON. */
export async function GET() {
  try {
    const me = await assertUser();
    await enforceRateLimit(`export:${me.id}`, 5, 3600);
    const id = me.id;
    const [u] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        username: user.displayUsername,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, id));
    const data = {
      exportedAt: new Date().toISOString(),
      notice: "ChronoBlink Arcade personal data export. Password hashes and session tokens are intentionally excluded.",
      user: u,
      linkedAccounts: await db.select({ provider: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, id)),
      activeSessions: await db
        .select({ createdAt: session.createdAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
        .from(session)
        .where(eq(session.userId, id)),
      profile: (await db.select().from(profiles).where(eq(profiles.userId, id)))[0] ?? null,
      developer: (await db.select().from(developers).where(eq(developers.userId, id)))[0] ?? null,
      favorites: await db.select().from(favorites).where(eq(favorites.userId, id)),
      playSessions: await db
        .select({ id: gameSessions.id, gameId: gameSessions.gameId, device: gameSessions.device, startedAt: gameSessions.startedAt, activeSeconds: gameSessions.activeSeconds })
        .from(gameSessions)
        .where(eq(gameSessions.userId, id))
        .orderBy(desc(gameSessions.startedAt))
        .limit(5000),
      runs: await db.select().from(gameRuns).where(eq(gameRuns.userId, id)).orderBy(desc(gameRuns.startedAt)).limit(5000),
      leaderboardEntries: await db.select().from(leaderboardEntries).where(eq(leaderboardEntries.userId, id)),
      xpTransactions: await db.select().from(xpTransactions).where(eq(xpTransactions.userId, id)),
      achievements: await db
        .select({ key: achievements.key, title: achievements.title, unlockedAt: achievementUnlocks.unlockedAt })
        .from(achievementUnlocks)
        .innerJoin(achievements, eq(achievements.id, achievementUnlocks.achievementId))
        .where(eq(achievementUnlocks.userId, id)),
      challengeProgress: await db.select().from(challengeProgress).where(eq(challengeProgress.userId, id)),
      cloudSaves: await db.select().from(cloudSaves).where(eq(cloudSaves.userId, id)),
      reportsFiled: await db.select().from(gameReports).where(eq(gameReports.userId, id)),
    };
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="chronoblink-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

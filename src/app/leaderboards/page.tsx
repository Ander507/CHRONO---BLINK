import { and, desc, eq } from "drizzle-orm";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/brand";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils";
import { db } from "@/server/db";
import { leaderboardDefinitions, profiles, user } from "@/server/db/schema";
import { cached } from "@/server/cache";
import { getCurrentUser } from "@/server/session";
import { getLeaderboardGames, getTopScores, seasonLabel } from "@/server/services/leaderboards";
import { mediaUrl } from "@/server/services/storage";

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "Top scores across every ChronoBlink Arcade game — today, this week, this season and all-time.",
  alternates: { canonical: "/leaderboards" },
};

async function topPlayersByXp() {
  return cached("lb:xp", 30_000, () =>
    db
      .select({
        username: user.displayUsername,
        name: user.name,
        xp: profiles.xpTotal,
        level: profiles.level,
        hue: profiles.avatarHue,
        glyph: profiles.avatarGlyph,
        frameId: profiles.frameId,
      })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(and(eq(user.banned, false), eq(profiles.isPublic, true)))
      .orderBy(desc(profiles.xpTotal))
      .limit(10),
  );
}

export default async function LeaderboardsPage() {
  const me = await getCurrentUser();
  const [gamesWithBoards, xpTop] = await Promise.all([getLeaderboardGames(), topPlayersByXp()]);
  const boards = await Promise.all(
    gamesWithBoards.map(async (g) => {
      const def = await db.query.leaderboardDefinitions.findFirst({
        where: and(eq(leaderboardDefinitions.gameId, g.id), eq(leaderboardDefinitions.key, "highscore")),
      });
      const rows = def ? await getTopScores(def.id, "weekly", 5) : [];
      return { game: g, def, rows: rows.map((r) => ({ ...r, isMe: r.userId === me?.id })) };
    }),
  );
  const ranked = xpTop.filter((p) => p.xp > 0);
  return (
    <div>
      <PageHeader title="Leaderboards" description={`Weekly top 5 for every game · ${seasonLabel()} · rankings roll over automatically at 00:00 UTC (daily) and Monday 00:00 UTC (weekly).`} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5 md:grid-cols-2">
          {boards.length === 0 ? <EmptyState icon={<Trophy />} title="No leaderboards yet" className="md:col-span-2" /> : null}
          {boards.map(({ game, def, rows }) => (
            <section key={game.id} className="surface overflow-hidden">
              <Link href={`/leaderboards/${game.slug}`} className="group relative block h-24 overflow-hidden">
                {game.coverKey ? (
                  <Image src={mediaUrl(game.coverKey)!} alt="" fill sizes="600px" className="object-cover opacity-60 transition group-hover:scale-105 group-hover:opacity-80" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
                <h2 className="absolute bottom-3 left-4 font-display text-lg font-bold text-fg">{game.title}</h2>
              </Link>
              <div className="p-4 pt-1">
                {rows.length ? (
                  <LeaderboardTable rows={rows} compact />
                ) : (
                  <p className="py-6 text-center text-sm text-fg-muted">No scores this week yet.</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-fg-subtle">{def?.verification === "provisional" ? "Provisional board" : "Verified board"}</span>
                  <Link href={`/leaderboards/${game.slug}`} className="font-semibold text-fg-muted hover:text-fg">
                    Full board →
                  </Link>
                </div>
              </div>
            </section>
          ))}
        </div>
        <aside className="surface h-fit p-4">
          <h2 className="font-display text-lg font-bold text-fg">Top players by XP</h2>
          <p className="mb-3 text-xs text-fg-subtle">Earned from verified play, achievements and daily challenges.</p>
          {ranked.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No XP earned yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {ranked.map((p, i) => (
                <li key={p.username ?? i} className="flex items-center gap-3 py-2.5">
                  <span className="tabular w-6 text-center text-sm font-bold text-fg-muted">{i + 1}</span>
                  <Avatar hue={p.hue} glyph={p.glyph} frameId={p.frameId} size={32} />
                  <Link href={`/profile/${p.username}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:text-primary-hover">
                    {p.username ?? p.name}
                  </Link>
                  <span className="text-right">
                    <span className="tabular block text-sm font-bold text-fg">{formatNumber(p.xp)} XP</span>
                    <span className="block text-[11px] text-fg-subtle">Level {p.level}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

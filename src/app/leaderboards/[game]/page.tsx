import { and, eq } from "drizzle-orm";
import { Info, Play, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn, formatNumber } from "@/lib/utils";
import { db } from "@/server/db";
import { games, leaderboardDefinitions } from "@/server/db/schema";
import { getCurrentUser } from "@/server/session";
import { PERIODS, getPlayerStanding, getTopScores, periodEnd, seasonLabel, type Period } from "@/server/services/leaderboards";

type Props = { params: Promise<{ game: string }>; searchParams: Promise<{ period?: string }> };
const LABEL: Record<Period, string> = { daily: "Today", weekly: "This week", season: "This season", all: "All-time" };

async function load(slug: string) {
  const [row] = await db
    .select({ game: games, def: leaderboardDefinitions })
    .from(games)
    .innerJoin(leaderboardDefinitions, and(eq(leaderboardDefinitions.gameId, games.id), eq(leaderboardDefinitions.key, "highscore")))
    .where(and(eq(games.slug, slug), eq(games.status, "published")));
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).game);
  if (!r) return { title: "Leaderboard not found" };
  return {
    title: `${r.game.title} leaderboard`,
    description: `Top ${r.game.title} scores on ChronoBlink Arcade — today, this week, this season and all-time.`,
    alternates: { canonical: `/leaderboards/${r.game.slug}` },
  };
}

export default async function GameLeaderboardPage({ params, searchParams }: Props) {
  const [{ game: slug }, sp] = await Promise.all([params, searchParams]);
  const r = await load(slug);
  if (!r) notFound();
  const period: Period = (PERIODS as readonly string[]).includes(sp.period ?? "") ? (sp.period as Period) : "all";
  const user = await getCurrentUser();
  const [rows, me] = await Promise.all([getTopScores(r.def.id, period, 100), user ? getPlayerStanding(r.def.id, user.id, period) : null]);
  const ends = periodEnd(period);
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-4 text-xs font-medium text-fg-subtle" aria-label="Breadcrumb">
        <Link href="/leaderboards" className="hover:text-fg">
          Leaderboards
        </Link>{" "}
        / <span className="text-fg-muted">{r.game.title}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-fg">{r.game.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {r.def.title} · {period === "season" ? seasonLabel() : LABEL[period]}
            {ends ? ` · resets ${ends.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
          </p>
        </div>
        <Button asChild>
          <Link href={`/play/${r.game.slug}`}>
            <Play className="fill-current" /> Play
          </Link>
        </Button>
      </header>
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1" role="tablist">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/leaderboards/${slug}${p === "all" ? "" : `?period=${p}`}`}
            role="tab"
            aria-selected={p === period}
            className={cn("flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold", p === period ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted")}
          >
            {LABEL[p]}
          </Link>
        ))}
      </div>
      {me ? (
        <div className="mb-4 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-fg">
          Your best: <span className="tabular font-bold">{formatNumber(me.best)}</span> · rank <span className="font-bold">#{me.rank}</span>
        </div>
      ) : null}
      <section className="surface p-2 sm:p-3">
        {rows.length ? (
          <LeaderboardTable rows={rows.map((x) => ({ ...x, isMe: x.userId === user?.id }))} />
        ) : (
          <EmptyState icon={<Trophy />} title="No scores yet" className="border-0">
            Be the first to post a score {period === "all" ? "" : LABEL[period].toLowerCase()}.
          </EmptyState>
        )}
      </section>
      {r.def.verification === "provisional" ? (
        <p className="mt-4 flex gap-2 text-xs leading-relaxed text-fg-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Provisional leaderboard. Every score must come from a server-timed run and pass plausibility limits (max {formatNumber(r.def.maxScorePerSecond)} points per second
          of play), but because the game runs in your browser, scores can&apos;t be cryptographically proven. No prizes are attached to provisional boards.
        </p>
      ) : null}
    </div>
  );
}

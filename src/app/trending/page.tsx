import { Flame } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GameGrid } from "@/components/games/game-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/session";
import { favoriteIds, trendingGames } from "@/server/services/catalog";

export const metadata: Metadata = {
  title: "Trending games",
  description: "The browser games people are actually playing on ChronoBlink Arcade this week.",
  alternates: { canonical: "/trending" },
};

export default async function TrendingPage() {
  const user = await getCurrentUser();
  const [games, favs] = await Promise.all([trendingGames(24), user ? favoriteIds(user.id) : Promise.resolve(new Set<string>())]);
  return (
    <div>
      <PageHeader
        title="Trending"
        description="Ranked by genuine play over the last 7 days: sessions with real active play time count, recent sessions count more (48-hour half-life)."
      />
      {games.length ? (
        <GameGrid games={games} favorites={favs} signedIn={Boolean(user)} />
      ) : (
        <EmptyState
          icon={<Flame />}
          title="Nothing is trending yet"
          action={
            <Button asChild variant="secondary">
              <Link href="/games">Find something to play</Link>
            </Button>
          }
        >
          We only rank games from real play sessions — there isn&apos;t enough activity this week yet.
        </EmptyState>
      )}
    </div>
  );
}

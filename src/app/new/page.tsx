import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { GameGrid } from "@/components/games/game-card";
import { Pagination } from "@/components/games/pagination";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/session";
import { favoriteIds, listGames } from "@/server/services/catalog";

export const metadata: Metadata = {
  title: "New games",
  description: "The latest free browser games published on ChronoBlink Arcade.",
  alternates: { canonical: "/new" },
};

export default async function NewPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const user = await getCurrentUser();
  const [result, favs] = await Promise.all([
    listGames({ sort: "new", page }),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
  ]);
  return (
    <div>
      <PageHeader title="New releases" description="Freshly published games, newest first." />
      {result.games.length ? (
        <GameGrid games={result.games} favorites={favs} signedIn={Boolean(user)} />
      ) : (
        <EmptyState icon={<Sparkles />} title="No games published yet" />
      )}
      <Pagination page={result.page} pages={result.pages} basePath="/new" params={sp} />
    </div>
  );
}

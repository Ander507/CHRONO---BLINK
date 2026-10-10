import { Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdUnit } from "@/components/ads";
import { CatalogControls } from "@/components/games/catalog-controls";
import { GameGrid } from "@/components/games/game-card";
import { Pagination } from "@/components/games/pagination";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { parseCatalogParams, type CatalogSearchParams } from "@/lib/catalog-params";
import { getCurrentUser } from "@/server/session";
import { displaySlot } from "@/server/services/ads";
import { favoriteIds, listGames } from "@/server/services/catalog";

export const metadata: Metadata = {
  title: "All games",
  description: "Browse every free browser game on ChronoBlink Arcade. Filter by device, sort by newest or most played.",
  alternates: { canonical: "/games" },
};

export default async function GamesPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const sp = await searchParams;
  const { sort, device, page } = parseCatalogParams(sp);
  const user = await getCurrentUser();
  const [result, favs, ad] = await Promise.all([
    listGames({ sort, device, page, pageSize: 24 }),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
    displaySlot("catalog_inline"),
  ]);
  return (
    <div>
      <PageHeader title="All games" description={`${result.total} free ${result.total === 1 ? "game" : "games"} — no downloads, no installs.`}>
        <Suspense>
          <CatalogControls />
        </Suspense>
      </PageHeader>
      {result.games.length ? (
        <GameGrid games={result.games} favorites={favs} signedIn={Boolean(user)} />
      ) : (
        <EmptyState icon={<Gamepad2 />} title="No games match these filters">
          Try a different device filter.
        </EmptyState>
      )}
      <div className="mt-10">
        <AdUnit slot={ad} />
      </div>
      <Pagination page={result.page} pages={result.pages} basePath="/games" params={{ ...sp }} />
    </div>
  );
}

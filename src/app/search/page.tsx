import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogControls } from "@/components/games/catalog-controls";
import { GameGrid } from "@/components/games/game-card";
import { Pagination } from "@/components/games/pagination";
import { SearchBox } from "@/components/shell/search-box";
import { EmptyState } from "@/components/ui/misc";
import { parseCatalogParams, type CatalogSearchParams } from "@/lib/catalog-params";
import { getCurrentUser } from "@/server/session";
import { categoriesWithCounts, favoriteIds, listGames } from "@/server/services/catalog";

export async function generateMetadata({ searchParams }: { searchParams: Promise<CatalogSearchParams> }): Promise<Metadata> {
  const q = (await searchParams).q?.trim();
  return {
    title: q ? `Search results for “${q.slice(0, 60)}”` : "Search games",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const { sort, device, page } = parseCatalogParams(sp);
  const user = await getCurrentUser();
  const [result, favs, cats] = await Promise.all([
    q ? listGames({ q, sort, device, page }) : Promise.resolve(null),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
    categoriesWithCounts(),
  ]);
  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">{q ? `Results for “${q}”` : "Search"}</h1>
      <SearchBox className="mt-5 max-w-2xl" initial={q} autoFocus={!q} />
      {result ? (
        <>
          <div className="my-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              {result.total} {result.total === 1 ? "game" : "games"} found
            </p>
            <Suspense>
              <CatalogControls />
            </Suspense>
          </div>
          {result.games.length ? (
            <GameGrid games={result.games} favorites={favs} signedIn={Boolean(user)} />
          ) : (
            <EmptyState icon={<SearchX />} title={`No games match “${q}”`}>
              Check the spelling or try a broader term like a genre.
            </EmptyState>
          )}
          <Pagination page={result.page} pages={result.pages} basePath="/search" params={{ ...sp }} />
        </>
      ) : (
        <div className="mt-10">
          <p className="mb-3 text-sm font-semibold text-fg-muted">Browse by category</p>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg-muted hover:border-line-strong hover:text-fg"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

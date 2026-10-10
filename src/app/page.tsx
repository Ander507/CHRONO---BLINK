import { ArrowRight, Flame, Sparkles } from "lucide-react";
import Link from "next/link";
import { AdUnit } from "@/components/ads";
import { CategoryTiles } from "@/components/games/category-tiles";
import { GameGrid, GameShelf } from "@/components/games/game-card";
import { ChallengeCard } from "@/components/home/challenge-card";
import { ContinueRow, GuestContinuePlaying } from "@/components/home/guest-continue";
import { FeaturedHero } from "@/components/home/hero";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/session";
import { displaySlot } from "@/server/services/ads";
import {
  categoriesWithCounts,
  favoriteIds,
  featuredGames,
  listGames,
  newGames,
  recentlyPlayed,
  recommendations,
  trendingGames,
} from "@/server/services/catalog";
import { getChallengeProgress, getTodayChallenge } from "@/server/services/challenges";

export default async function HomePage() {
  const user = await getCurrentUser();
  const signedIn = Boolean(user);
  const [featured, trending, fresh, recs, cats, all, challenge, favs, recent, banner] = await Promise.all([
    featuredGames(),
    trendingGames(10),
    newGames(10),
    recommendations({ userId: user?.id, limit: 8 }),
    categoriesWithCounts(),
    listGames({ sort: "new", pageSize: 12 }),
    getTodayChallenge(),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
    user ? recentlyPlayed(user.id, 6) : Promise.resolve([]),
    displaySlot("home_banner"),
  ]);
  const progress = user && challenge ? await getChallengeProgress(user.id, challenge.id) : null;
  const popularCats = [...cats].sort((a, b) => b.count - a.count || 0);

  return (
    <div className="space-y-12 sm:space-y-14">
      <h1 className="sr-only">ChronoBlink Arcade — free instant-play browser games</h1>

      {featured.length > 0 ? (
        <FeaturedHero signedIn={signedIn} games={featured.map((g) => ({ ...g, favorite: favs.has(g.id) }))} />
      ) : null}

      {user ? (
        recent.length > 0 ? (
          <section aria-labelledby="continue-heading">
            <SectionHeader id="continue-heading" title="Continue playing" subtitle="Pick up where you left off" />
            <ContinueRow items={recent.map((g) => ({ game: g, at: null }))} />
          </section>
        ) : null
      ) : (
        <GuestContinuePlaying />
      )}

      {challenge ? <ChallengeCard challenge={challenge} progress={progress ?? null} signedIn={signedIn} /> : null}

      <section aria-labelledby="trending-heading">
        <SectionHeader
          id="trending-heading"
          title="Trending"
          subtitle="Ranked by real play time over the last 7 days"
          action={
            trending.length > 0 ? (
              <Link href="/trending" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
                See all <ArrowRight className="size-4" />
              </Link>
            ) : null
          }
        />
        {trending.length > 0 ? (
          <GameShelf games={trending} favorites={favs} signedIn={signedIn} />
        ) : (
          <EmptyState icon={<Flame />} title="Nothing trending yet">
            Trending is calculated only from genuine play sessions. Play a game and it will start to show up here.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="new-heading">
        <SectionHeader
          id="new-heading"
          title="New releases"
          subtitle="Freshly published on ChronoBlink"
          action={
            <Link href="/new" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
              See all <ArrowRight className="size-4" />
            </Link>
          }
        />
        {fresh.length > 0 ? (
          <GameShelf games={fresh} favorites={favs} signedIn={signedIn} />
        ) : (
          <EmptyState icon={<Sparkles />} title="No games published yet" />
        )}
      </section>

      {recs.games.length > 0 ? (
        <section aria-labelledby="recs-heading">
          <SectionHeader
            id="recs-heading"
            title="Recommended for you"
            subtitle={
              recs.personalised
                ? "Based on the categories and tags of games you've played and favorited"
                : "Play or favorite a few games and we'll tailor these picks"
            }
          />
          <GameShelf games={recs.games} favorites={favs} signedIn={signedIn} />
        </section>
      ) : null}

      <AdUnit slot={banner} />

      <section aria-labelledby="cats-heading">
        <SectionHeader
          id="cats-heading"
          title="Popular categories"
          action={
            <Link href="/categories" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
              All categories <ArrowRight className="size-4" />
            </Link>
          }
        />
        <CategoryTiles categories={popularCats} />
      </section>

      <section aria-labelledby="all-heading">
        <SectionHeader id="all-heading" title="All games" subtitle={`${all.total} ${all.total === 1 ? "game" : "games"} ready to play instantly`} />
        <GameGrid games={all.games} favorites={favs} signedIn={signedIn} />
        {all.pages > 1 ? (
          <div className="mt-8 flex justify-center">
            <Button asChild variant="secondary">
              <Link href="/games?page=2">Browse more games</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

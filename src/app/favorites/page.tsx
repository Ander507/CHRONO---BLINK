import { Heart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GameGrid } from "@/components/games/game-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/session";
import { favoriteGames } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Favorites", robots: { index: false } };

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Favorites" />
        <EmptyState
          icon={<Heart />}
          title="Sign in to keep favorites"
          action={
            <Button asChild>
              <Link href="/login?next=/favorites">Sign in</Link>
            </Button>
          }
        >
          Favorites are saved to your account so they follow you to every device.
        </EmptyState>
      </div>
    );
  }
  const games = await favoriteGames(user.id);
  return (
    <div>
      <PageHeader title="Favorites" description={`${games.length} saved ${games.length === 1 ? "game" : "games"}`} />
      {games.length ? (
        <GameGrid games={games} favorites={new Set(games.map((g) => g.id))} signedIn />
      ) : (
        <EmptyState
          icon={<Heart />}
          title="No favorites yet"
          action={
            <Button asChild variant="secondary">
              <Link href="/games">Browse games</Link>
            </Button>
          }
        >
          Tap the heart on any game to save it here.
        </EmptyState>
      )}
    </div>
  );
}

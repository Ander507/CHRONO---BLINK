import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DevGameTable } from "@/components/developer/dev-game-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/server/session";
import { getDeveloper, listDeveloperGames } from "@/server/services/developer";

export const metadata: Metadata = { title: "Your games", robots: { index: false } };

export default async function DevGamesPage() {
  const user = await requireUser("/developers/games");
  const dev = await getDeveloper(user.id);
  const games = dev ? await listDeveloperGames(dev.id) : [];
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-fg">Games</h1>
        <Button asChild size="sm">
          <Link href="/developers/games/new">
            <Plus /> New game
          </Link>
        </Button>
      </div>
      {games.length ? <DevGameTable games={games} /> : <EmptyState title="No games yet">Create a listing to get started.</EmptyState>}
    </div>
  );
}

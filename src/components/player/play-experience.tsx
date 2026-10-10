"use client";

import * as React from "react";
import { LeaderboardPanel } from "@/components/leaderboard/leaderboard-panel";
import { GamePlayer, type PlayerGame } from "@/components/player/game-player";

type LbInitial = React.ComponentProps<typeof LeaderboardPanel>["initial"];

/** Player + live leaderboard: an accepted score refreshes the board. */
export function PlayExperience({
  game,
  signedIn,
  header,
  aside,
  children,
  leaderboard,
}: {
  game: PlayerGame;
  signedIn: boolean;
  header: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  leaderboard: LbInitial | null;
}) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const onScore = React.useCallback(() => setRefreshKey((k) => k + 1), []);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <GamePlayer game={game} signedIn={signedIn} onScore={onScore} />
        {header}
        {children}
      </div>
      <div className="space-y-6">
        {leaderboard ? <LeaderboardPanel slug={game.slug} refreshKey={refreshKey} signedIn={signedIn} initial={leaderboard} /> : null}
        {aside}
      </div>
    </div>
  );
}

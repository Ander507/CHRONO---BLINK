import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DevGameTable } from "@/components/developer/dev-game-table";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { EmptyState, Stat } from "@/components/ui/misc";
import { formatDuration, formatNumber } from "@/lib/utils";
import { requireUser } from "@/server/session";
import { gameMetrics } from "@/server/services/analytics";
import { developerGameIds, developerStorageBytes, getDeveloper, listDeveloperGames, UPLOAD_QUOTA, uploadPolicy } from "@/server/services/developer";

export const metadata: Metadata = { title: "Developer dashboard", robots: { index: false } };

export default async function DevDashboard() {
  const user = await requireUser("/developers/dashboard");
  const dev = await getDeveloper(user.id);
  if (!dev) return <EmptyState title="Staff account">Use the admin panel to review submissions.</EmptyState>;
  const [games, ids, used] = await Promise.all([listDeveloperGames(dev.id), developerGameIds(dev.id), developerStorageBytes(dev.id)]);
  const metrics = ids.length ? await gameMetrics(ids, 30) : null;
  const policy = uploadPolicy(user, dev);
  return (
    <div className="space-y-8">
      {!policy.allowed ? <FormMessage tone="info">{policy.reason}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Games" value={games.length} hint={`${games.filter((g) => g.status === "published").length} published`} />
        <Stat label="Sessions (30d)" value={formatNumber(metrics?.sessions ?? 0)} />
        <Stat label="Avg. active play" value={metrics?.avgActiveSeconds != null ? formatDuration(metrics.avgActiveSeconds) : "—"} />
        <Stat label="Storage used" value={`${(used / 1048576).toFixed(1)} MB`} hint={`of ${UPLOAD_QUOTA.maxStorageBytesPerDeveloper / 1048576 / 1024} GB`} />
      </div>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-fg">Your games</h2>
          <Button asChild size="sm">
            <Link href="/developers/games/new">
              <Plus /> New game
            </Link>
          </Button>
        </div>
        {games.length ? (
          <DevGameTable games={games} />
        ) : (
          <EmptyState
            title="No games yet"
            action={
              <Button asChild>
                <Link href="/developers/games/new">Create your first listing</Link>
              </Button>
            }
          >
            Create a listing, upload a build, preview it and submit it for review.
          </EmptyState>
        )}
      </section>
      <section className="surface p-5 text-sm text-fg-muted">
        <h2 className="font-display text-lg font-bold text-fg">Earnings</h2>
        <p className="mt-2">
          Revenue sharing isn&apos;t live yet. Payouts stay disabled until ad attribution, financial reconciliation, identity verification and tax handling are in
          place — we&apos;ll never show estimated earnings before they&apos;re real.
        </p>
      </section>
    </div>
  );
}

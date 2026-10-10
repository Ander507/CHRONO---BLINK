import type { Metadata } from "next";
import Link from "next/link";
import { MetricsView } from "@/components/analytics/metrics-view";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/session";
import { gameMetrics } from "@/server/services/analytics";
import { getDeveloper, listDeveloperGames } from "@/server/services/developer";

export const metadata: Metadata = { title: "Developer analytics", robots: { index: false } };

export default async function DevAnalyticsPage({ searchParams }: { searchParams: Promise<{ game?: string; days?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/developers/analytics");
  const dev = await getDeveloper(user.id);
  const games = dev ? await listDeveloperGames(dev.id) : [];
  if (games.length === 0) return <EmptyState title="No games yet">Analytics appear once your games are published and played.</EmptyState>;
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30;
  // Ownership: only ids from the developer's own games are queried.
  const selected = games.find((g) => g.id === sp.game) ?? null;
  const metrics = await gameMetrics(selected ? [selected.id] : games.map((g) => g.id), days);
  const q = (o: { game?: string | null; days?: number }) => {
    const p = new URLSearchParams();
    const g = o.game === undefined ? selected?.id : o.game;
    if (g) p.set("game", g);
    p.set("days", String(o.days ?? days));
    return `/developers/analytics?${p}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q({ game: null })} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", !selected ? "bg-raised text-fg" : "text-fg-muted hover:text-fg")}>
          All games
        </Link>
        {games.map((g) => (
          <Link key={g.id} href={q({ game: g.id })} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", selected?.id === g.id ? "bg-raised text-fg" : "text-fg-muted hover:text-fg")}>
            {g.title}
          </Link>
        ))}
        <span className="ml-auto flex gap-1">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={q({ days: d })} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", d === days ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg")}>
              {d}d
            </Link>
          ))}
        </span>
      </div>
      <MetricsView m={metrics} days={days} />
    </div>
  );
}

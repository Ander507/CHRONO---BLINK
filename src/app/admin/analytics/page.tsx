import { eq } from "drizzle-orm";
import Link from "next/link";
import { MetricsView } from "@/components/analytics/metrics-view";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { games } from "@/server/db/schema";
import { gameMetrics } from "@/server/services/analytics";

export const metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ game?: string; days?: string }> }) {
  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30;
  const list = await db.select({ id: games.id, title: games.title }).from(games).where(eq(games.status, "published")).orderBy(games.title);
  const selected = list.find((g) => g.id === sp.game) ?? null;
  const m = await gameMetrics(selected ? [selected.id] : null, days);
  const href = (game: string | null, d = days) => `/admin/analytics?${new URLSearchParams({ ...(game ? { game } : {}), days: String(d) })}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(null)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", !selected ? "bg-raised text-fg" : "text-fg-muted hover:text-fg")}>
          Whole platform
        </Link>
        {list.map((g) => (
          <Link key={g.id} href={href(g.id)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", selected?.id === g.id ? "bg-raised text-fg" : "text-fg-muted hover:text-fg")}>
            {g.title}
          </Link>
        ))}
        <span className="ml-auto flex gap-1">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={href(selected?.id ?? null, d)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", d === days ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg")}>
              {d}d
            </Link>
          ))}
        </span>
      </div>
      <MetricsView m={m} days={days} />
    </div>
  );
}

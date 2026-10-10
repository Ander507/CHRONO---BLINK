"use client";

import { Info, Trophy } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { LeaderboardTable, type LbRow } from "@/components/leaderboard/leaderboard-table";
import { cn, formatNumber } from "@/lib/utils";

const PERIOD_LABEL = { daily: "Today", weekly: "Week", season: "Season", all: "All-time" } as const;
type Period = keyof typeof PERIOD_LABEL;
type Data = { board: { title: string; verification: string }; rows: LbRow[]; me: { best: number; rank: number } | null };

export function LeaderboardPanel({
  slug,
  refreshKey,
  signedIn,
  initial,
}: {
  slug: string;
  refreshKey: number;
  signedIn: boolean;
  initial: Data;
}) {
  const [period, setPeriod] = React.useState<Period>("all");
  const [data, setData] = React.useState<Data>(initial);
  const [loading, setLoading] = React.useState(false);
  const firstRun = React.useRef(true);

  React.useEffect(() => {
    if (firstRun.current && period === "all" && refreshKey === 0) {
      firstRun.current = false;
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/leaderboards/${slug}?period=${period}&limit=10`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [slug, period, refreshKey]);

  return (
    <section className="surface p-4" aria-labelledby="lb-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="lb-heading" className="flex items-center gap-2 font-display text-lg font-bold text-fg">
          <Trophy className="size-4 text-warning" /> Leaderboard
        </h2>
        <Link href={`/leaderboards/${slug}`} className="text-xs font-semibold text-fg-subtle hover:text-fg">
          Full board →
        </Link>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-ink/60 p-1" role="tablist" aria-label="Leaderboard period">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === period}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-lg py-1.5 text-xs font-semibold transition-colors",
              p === period ? "bg-raised text-fg shadow" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <div className={cn("transition-opacity", loading && "opacity-50")} aria-busy={loading}>
        {data.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">No scores yet for this period — be the first.</p>
        ) : (
          <LeaderboardTable rows={data.rows} compact />
        )}
      </div>
      {signedIn ? (
        data.me ? (
          <p className="mt-3 rounded-xl border border-line bg-raised/60 px-3 py-2 text-xs text-fg-muted">
            Your best: <span className="tabular font-bold text-fg">{formatNumber(data.me.best)}</span> · rank{" "}
            <span className="font-bold text-fg">#{data.me.rank}</span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-fg-subtle">Finish a run to post your first score.</p>
        )
      ) : (
        <p className="mt-3 text-xs text-fg-subtle">
          <Link href={`/login?next=/play/${slug}`} className="font-semibold text-electric hover:underline">
            Sign in
          </Link>{" "}
          to appear on the leaderboard.
        </p>
      )}
      {data.board.verification === "provisional" ? (
        <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
          <Info className="mt-0.5 size-3 shrink-0" />
          Provisional board: scores are checked for plausibility on the server but come from client-side game code, so no prizes are attached.
        </p>
      ) : null}
    </section>
  );
}

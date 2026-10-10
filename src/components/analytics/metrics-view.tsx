import { Stat } from "@/components/ui/misc";
import { formatDuration, formatNumber } from "@/lib/utils";
import type { GameMetrics } from "@/server/services/analytics";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Renders genuine, measured metrics. Shows "—" or explanations rather than inventing numbers. */
export function MetricsView({ m, days }: { m: GameMetrics; days: number }) {
  const max = Math.max(1, ...m.daily.map((d) => d.sessions));
  const totalDevices = m.devices.reduce((n, d) => n + d.sessions, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Sessions (${days}d)`} value={formatNumber(m.sessions)} hint={`${formatNumber(m.loadedSessions)} loaded · load success ${pct(m.loadSuccessRate)}`} />
        <Stat
          label="Unique players"
          value={formatNumber(m.identifiedPlayers)}
          hint={`${formatNumber(m.signedInPlayers)} signed in · guests without analytics consent aren't counted`}
        />
        <Stat
          label="Avg. active playtime"
          value={m.avgActiveSeconds != null ? formatDuration(m.avgActiveSeconds) : "—"}
          hint={`${formatDuration(m.totalActiveSeconds)} total · visible & focused time only`}
        />
        <Stat label="Start conversion" value={pct(m.startConversion)} hint={`${formatNumber(m.abandonedBeforeStart)} loaded sessions never started a run`} />
        <Stat label="Returning players" value={formatNumber(m.returningPlayers)} hint="Identified players active on 2+ days" />
        <Stat
          label="Day-1 retention"
          value={m.d1Retention ? pct(m.d1Retention.rate) : "—"}
          hint={m.d1Retention ? `cohort of ${m.d1Retention.cohort}` : "Shown once 20+ identified players exist"}
        />
      </div>
      <section className="surface p-5">
        <h3 className="font-display text-base font-bold text-fg">Sessions per day</h3>
        {m.daily.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">No sessions in this period.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label={`Sessions per day over the last ${days} days`}>
            {m.daily.map((d) => (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.sessions} sessions, ${formatDuration(d.activeSeconds)} active`}>
                <div className="w-full rounded-t bg-gradient-to-t from-primary to-electric" style={{ height: `${(d.sessions / max) * 150}px`, minHeight: 2 }} />
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="surface p-5">
        <h3 className="font-display text-base font-bold text-fg">Devices</h3>
        {totalDevices === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No data yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {m.devices.map((d) => (
              <li key={d.device} className="flex items-center gap-3 text-sm">
                <span className="w-20 capitalize text-fg-muted">{d.device}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full bg-primary" style={{ width: `${(d.sessions / totalDevices) * 100}%` }} />
                </span>
                <span className="tabular w-16 text-right text-fg">{formatNumber(d.sessions)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

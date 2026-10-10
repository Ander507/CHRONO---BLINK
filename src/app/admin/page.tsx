import Link from "next/link";
import { Table } from "@/components/admin/admin-ui";
import { Stat } from "@/components/ui/misc";
import { formatDuration, formatNumber } from "@/lib/utils";
import { platformOverview } from "@/server/services/admin";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const o = await platformOverview();
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Games" value={o.games.total} hint={`${o.games.published} published · ${o.games.in_review} in review`} />
        <Stat label="Registered users" value={formatNumber(o.users.total)} hint={`${o.users.new7} new this week · ${o.users.verified} verified`} />
        <Stat label="Active players (7d)" value={formatNumber(o.week.players)} hint={`${o.week.signed_in} signed in · identified players only`} />
        <Stat label="Sessions (7d)" value={formatNumber(o.week.sessions)} hint={`${formatNumber(o.week.runs)} runs · ${formatDuration(o.week.active_seconds)} active`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/submissions" className="surface flex items-center justify-between p-5 transition hover:border-line-strong">
          <span className="font-semibold text-fg">Pending submissions</span>
          <span className="tabular font-display text-2xl font-bold text-warning">{o.pendingSubmissions}</span>
        </Link>
        <Link href="/admin/reports" className="surface flex items-center justify-between p-5 transition hover:border-line-strong">
          <span className="font-semibold text-fg">Open reports</span>
          <span className="tabular font-display text-2xl font-bold text-danger">{o.openReports}</span>
        </Link>
      </div>
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-fg">Game engagement · last 7 days</h2>
        <Table head={["Game", "Sessions", "Loaded", "Avg. active", "Runs", "Scores"]}>
          {o.engagement.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-semibold text-fg">
                <Link href={`/admin/analytics?game=${e.id}`} className="hover:text-primary-hover">
                  {e.title}
                </Link>
              </td>
              <td className="tabular px-4 py-3">{formatNumber(e.sessions)}</td>
              <td className="tabular px-4 py-3">{formatNumber(e.loaded)}</td>
              <td className="tabular px-4 py-3">{e.avg_active != null ? formatDuration(e.avg_active) : "—"}</td>
              <td className="tabular px-4 py-3">{formatNumber(e.runs)}</td>
              <td className="tabular px-4 py-3">{formatNumber(e.scores)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

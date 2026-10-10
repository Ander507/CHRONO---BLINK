import { Flag } from "lucide-react";
import Link from "next/link";
import { ReportControls } from "@/components/admin/admin-controls";
import { Badge, EmptyState } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { listReports } from "@/server/services/admin";

export const metadata = { title: "Reports" };

const FILTERS = ["open", "resolved", "dismissed", "all"] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = (await searchParams).status;
  const status = (FILTERS as readonly string[]).includes(s ?? "") ? (s as (typeof FILTERS)[number]) : "open";
  const reports = await listReports(status);
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/reports?status=${f}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold capitalize", f === status ? "bg-raised text-fg" : "text-fg-muted hover:text-fg")}>
            {f}
          </Link>
        ))}
      </div>
      {reports.length === 0 ? (
        <EmptyState icon={<Flag />} title={`No ${status === "all" ? "" : status} reports`} />
      ) : (
        <ul className="space-y-3">
          {reports.map(({ report: r, title, slug, reporter }) => (
            <li key={r.id} className="surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/play/${slug}`} className="font-semibold text-fg hover:text-primary-hover">
                  {title}
                </Link>
                <Badge tone={r.reason === "malicious" ? "danger" : "warning"}>{r.reason}</Badge>
                <Badge tone={r.status === "open" ? "primary" : "neutral"}>{r.status}</Badge>
                <span className="text-xs text-fg-subtle">
                  {timeAgo(r.createdAt)} · {reporter ? `@${reporter}` : "guest"}
                </span>
              </div>
              {r.details ? <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{r.details}</p> : null}
              {r.resolution ? <p className="mt-2 text-xs text-fg-subtle">Resolution: {r.resolution}</p> : null}
              {r.status === "open" ? (
                <div className="mt-3">
                  <ReportControls id={r.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

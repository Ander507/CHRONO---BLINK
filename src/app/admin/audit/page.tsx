import { Pagination } from "@/components/games/pagination";
import { Table } from "@/components/admin/admin-ui";
import { Input } from "@/components/ui/form";
import { requireRole } from "@/server/session";
import { listAuditLogs } from "@/server/services/admin";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requireRole("admin");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listAuditLogs({ action: sp.action, page });
  return (
    <div className="space-y-4">
      <form className="max-w-sm" role="search">
        <Input name="action" defaultValue={sp.action ?? ""} placeholder="Filter by action prefix, e.g. version." aria-label="Filter by action" />
      </form>
      <Table head={["When", "Actor", "Action", "Target", "Details", "IP"]}>
        {rows.map(({ log, actor, actorEmail }) => (
          <tr key={log.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-fg-muted">{log.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
            <td className="px-4 py-2.5 text-xs">{actor ? `@${actor}` : (actorEmail ?? "system")}</td>
            <td className="px-4 py-2.5 font-mono text-xs text-fg">{log.action}</td>
            <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
              {log.targetType}
              {log.targetId ? `:${log.targetId.slice(0, 12)}` : ""}
            </td>
            <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-fg-subtle" title={JSON.stringify(log.details)}>
              {JSON.stringify(log.details)}
            </td>
            <td className="px-4 py-2.5 text-xs text-fg-subtle">{log.ip ?? ""}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / 50))} basePath="/admin/audit" params={{ action: sp.action }} />
    </div>
  );
}

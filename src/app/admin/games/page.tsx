import Link from "next/link";
import { FeatureDialog, GameVisibilityControls } from "@/components/admin/admin-controls";
import { Table } from "@/components/admin/admin-ui";
import { STATUS_TONE, statusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/misc";
import { requireRole } from "@/server/session";
import { allGamesForAdmin } from "@/server/services/admin";

export const metadata = { title: "Games" };

export default async function AdminGamesPage() {
  const me = await requireRole("moderator");
  const games = await allGamesForAdmin();
  return (
    <Table head={["Game", "Studio", "Status", "Published", ""]}>
      {games.map((g) => (
        <tr key={g.id}>
          <td className="px-4 py-3">
            <Link href={`/play/${g.slug}`} className="font-semibold text-fg hover:text-primary-hover">
              {g.title}
            </Link>
            <span className="block text-xs text-fg-subtle">/{g.slug}</span>
          </td>
          <td className="px-4 py-3 text-fg-muted">{g.studio ?? g.creditName}</td>
          <td className="px-4 py-3">
            <Badge tone={STATUS_TONE[g.status] ?? "neutral"}>{statusLabel(g.status)}</Badge>
          </td>
          <td className="px-4 py-3 text-fg-muted">{g.publishedAt ? g.publishedAt.toLocaleDateString("en-US") : "—"}</td>
          <td className="px-4 py-3">
            <div className="flex items-center justify-end gap-1">
              {me.role === "admin" && g.status === "published" ? <FeatureDialog gameId={g.id} title={g.title} /> : null}
              <GameVisibilityControls gameId={g.id} status={g.status} hasBuild={Boolean(g.liveVersionId)} isAdmin={me.role === "admin"} />
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

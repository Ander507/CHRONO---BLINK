import { DeveloperControls } from "@/components/admin/admin-controls";
import { Table } from "@/components/admin/admin-ui";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireRole } from "@/server/session";
import { listDevelopers } from "@/server/services/admin";

export const metadata = { title: "Developers" };

export default async function AdminDevelopersPage() {
  await requireRole("admin");
  const devs = await listDevelopers();
  if (devs.length === 0) return <EmptyState title="No developer accounts yet" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Verified studios may upload builds while no malware scanner is configured. Every build is still validated and reviewed before publication.
      </p>
      <Table head={["Studio", "Account", "Games", "Status", ""]}>
        {devs.map(({ dev, email, username, games }) => (
          <tr key={dev.id}>
            <td className="px-4 py-3">
              <span className="font-semibold text-fg">{dev.studioName}</span>
              {dev.website ? <span className="block text-xs text-fg-subtle">{dev.website}</span> : null}
            </td>
            <td className="px-4 py-3 text-fg-muted">
              @{username} · {email}
            </td>
            <td className="tabular px-4 py-3">{games}</td>
            <td className="px-4 py-3">
              <Badge tone={dev.status === "active" ? "success" : "danger"}>{dev.status}</Badge>
              {dev.trusted ? (
                <Badge tone="primary" className="ml-1">
                  verified
                </Badge>
              ) : null}
            </td>
            <td className="px-4 py-3">
              <DeveloperControls devId={dev.id} trusted={dev.trusted} status={dev.status} />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

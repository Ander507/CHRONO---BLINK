import Link from "next/link";
import { UserControls } from "@/components/admin/admin-controls";
import { Table } from "@/components/admin/admin-ui";
import { Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { requireRole } from "@/server/session";
import { searchUsers } from "@/server/services/admin";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole("moderator");
  const q = ((await searchParams).q ?? "").slice(0, 80);
  const users = await searchUsers(q);
  return (
    <div className="space-y-4">
      <form className="max-w-md" role="search">
        <Input name="q" defaultValue={q} placeholder="Search email, username or name" aria-label="Search users" />
      </form>
      <Table head={["User", "Email", "Role", "Joined", ""]}>
        {users.map((u) => (
          <tr key={u.id} className={u.banned ? "opacity-60" : undefined}>
            <td className="px-4 py-3">
              {u.username ? (
                <Link href={`/profile/${u.username}`} className="font-semibold text-fg hover:text-primary-hover">
                  @{u.username}
                </Link>
              ) : (
                <span className="font-semibold text-fg">{u.name}</span>
              )}
              {u.banned ? (
                <Badge tone="danger" className="ml-2">
                  banned
                </Badge>
              ) : null}
            </td>
            <td className="px-4 py-3 text-fg-muted">
              {u.email} {u.emailVerified ? null : <Badge className="ml-1">unverified</Badge>}
            </td>
            <td className="px-4 py-3">
              <Badge tone={u.role === "admin" ? "primary" : u.role === "moderator" ? "electric" : "neutral"}>{u.role}</Badge>
            </td>
            <td className="px-4 py-3 text-fg-muted">{u.createdAt.toLocaleDateString("en-US")}</td>
            <td className="px-4 py-3">
              <UserControls userId={u.id} role={u.role} banned={u.banned} isAdmin={me.role === "admin"} isSelf={u.id === me.id} />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

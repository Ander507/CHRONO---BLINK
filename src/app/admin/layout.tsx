import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/misc";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · ChronoBlink" }, robots: { index: false } };

/** Every admin page is server-guarded here AND in each action (assertRole). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("moderator", "/admin");
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold text-fg">Admin</h1>
        <Badge tone={user.role === "admin" ? "primary" : "electric"}>{user.role}</Badge>
      </div>
      <AdminNav isAdmin={user.role === "admin"} />
      {children}
    </div>
  );
}

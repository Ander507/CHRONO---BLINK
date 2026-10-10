import Link from "next/link";
import { DevNav } from "@/components/developer/dev-nav";
import { Badge } from "@/components/ui/misc";
import { requireUser } from "@/server/session";
import { getDeveloper } from "@/server/services/developer";

/** All developer portal pages require a signed-in user with an activated developer account. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/developers/dashboard");
  const dev = await getDeveloper(user.id);
  if (!dev && user.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold text-fg">Developer account required</h1>
        <p className="mt-2 text-fg-muted">Activate a developer account to publish games on ChronoBlink.</p>
        <Link href="/developers#activate" className="mt-6 inline-block font-semibold text-electric hover:underline">
          Activate now →
        </Link>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-fg-muted">{dev?.studioName ?? "Staff"}</p>
        {dev?.trusted ? <Badge tone="success">Verified studio</Badge> : null}
        {dev?.status === "suspended" ? <Badge tone="danger">Suspended</Badge> : null}
      </div>
      <DevNav />
      {children}
    </div>
  );
}

import { CheckCircle2, XCircle } from "lucide-react";
import { requireRole } from "@/server/session";
import { systemHealth } from "@/server/services/admin";

export const metadata = { title: "System health" };
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await requireRole("admin");
  const checks = await systemHealth();
  return (
    <ul className="surface divide-y divide-line" data-testid="health">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-3 px-4 py-3">
          {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-label="Attention" />}
          <div>
            <p className="font-semibold text-fg">{c.name}</p>
            <p className="text-sm text-fg-muted">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

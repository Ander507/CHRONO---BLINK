import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
        <ChevronLeft className="size-4" />
      </PageLink>
      {nums.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - nums[i - 1]! > 1 ? <span className="px-1 text-fg-subtle">…</span> : null}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "grid size-10 place-items-center rounded-xl text-sm font-semibold",
              p === page ? "bg-primary text-white" : "text-fg-muted hover:bg-raised hover:text-fg",
            )}
          >
            {p}
          </Link>
        </span>
      ))}
      <PageLink href={href(page + 1)} disabled={page >= pages} label="Next page">
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled)
    return (
      <span aria-disabled className="grid size-10 place-items-center rounded-xl text-fg-subtle opacity-40">
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className="grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg">
      {children}
    </Link>
  );
}

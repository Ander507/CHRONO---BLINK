"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; admin?: boolean }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/developers", label: "Developers", admin: true },
  { href: "/admin/content", label: "Featured & categories", admin: true },
  { href: "/admin/challenges", label: "Challenges", admin: true },
  { href: "/admin/achievements", label: "Achievements", admin: true },
  { href: "/admin/ads", label: "Ads", admin: true },
  { href: "/admin/audit", label: "Audit log", admin: true },
  { href: "/admin/system", label: "System", admin: true },
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar mb-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Admin">
      {NAV.filter((n) => isAdmin || !n.admin).map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-semibold",
              active ? "border-primary text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

type ActionResult = { ok: true } | { ok: false; error: string };

/** Button that runs a server action, toasts the outcome and refreshes server data. */
export function ActionButton({
  action,
  success = "Done",
  confirm,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & { action: () => Promise<ActionResult>; success?: string; confirm?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (!r.ok) return void toast.error(r.error);
          toast.success(success);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function useAction() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const exec = React.useCallback(
    (fn: () => Promise<ActionResult>, success = "Saved", after?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) return void toast.error(r.error);
        toast.success(success);
        after?.();
        router.refresh();
      }),
    [router],
  );
  return { pending, exec };
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-fg-subtle">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

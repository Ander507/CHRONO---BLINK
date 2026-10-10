"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/developers/dashboard", label: "Dashboard" },
  { href: "/developers/games", label: "Games" },
  { href: "/developers/analytics", label: "Analytics" },
  { href: "/developers/docs", label: "SDK docs" },
];

export function DevNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar mb-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Developer portal">
      {ITEMS.map((i) => {
        const active = pathname === i.href || (i.href !== "/developers/dashboard" && pathname.startsWith(i.href));
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              active ? "border-primary text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

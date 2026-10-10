"use client";

import { Monitor, Smartphone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

export function CatalogControls({ showSort = true }: { showSort?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const sort = params.get("sort") ?? "new";
  const device = params.get("device") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      {showSort ? (
        <div className="flex rounded-xl border border-line bg-surface p-1" role="radiogroup" aria-label="Sort games">
          {[
            ["new", "Newest"],
            ["popular", "Popular"],
            ["az", "A–Z"],
          ].map(([v, l]) => (
            <button
              key={v}
              role="radio"
              aria-checked={sort === v}
              onClick={() => update("sort", v === "new" ? "" : v!)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", sort === v ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted")}
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex rounded-xl border border-line bg-surface p-1" role="radiogroup" aria-label="Device">
        {[
          ["", "All devices", null],
          ["desktop", "Desktop", Monitor],
          ["mobile", "Mobile", Smartphone],
        ].map(([v, l, Icon]) => {
          const I = Icon as React.ElementType | null;
          return (
            <button
              key={String(v)}
              role="radio"
              aria-checked={device === v}
              onClick={() => update("device", v as string)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
                device === v ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {I ? <I className="size-3.5" /> : null}
              {l as string}
            </button>
          );
        })}
      </div>
    </div>
  );
}

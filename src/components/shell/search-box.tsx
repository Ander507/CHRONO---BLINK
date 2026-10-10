"use client";

import { Loader2, Search } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

type Suggestion = { slug: string; title: string; cover: string | null; category: string | null };

export function SearchBox({ className, autoFocus, initial = "" }: { className?: string; autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const [q, setQ] = React.useState(initial);
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && t?.tagName !== "INPUT" && t?.tagName !== "TEXTAREA" && !t?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = (await res.json()) as { results: Suggestion[] };
          setItems(data.results);
          setActive(-1);
        }
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function go(target?: Suggestion) {
    setOpen(false);
    if (target) router.push(`/play/${target.slug}`);
    else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    inputRef.current?.blur();
  }

  const showList = open && q.trim().length > 0;
  const visible = q.trim() ? items : [];

  return (
    <div className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(active >= 0 ? items[active] : undefined);
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          type="search"
          name="q"
          placeholder="Search games"
          aria-label="Search games"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-line bg-raised/70 pl-10 pr-12 text-sm text-fg placeholder:text-fg-subtle transition-colors hover:border-line-strong focus:border-primary focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading ? (
          <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-subtle" aria-hidden />
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line-strong px-1.5 text-[11px] text-fg-subtle sm:block">
            /
          </kbd>
        )}
      </form>
      {showList ? (
        <div id={listId} role="listbox" className="surface absolute inset-x-0 top-12 z-50 overflow-hidden p-1.5 shadow-[var(--shadow-lift)]">
          {visible.length === 0 && !loading ? (
            <p className="px-3 py-3 text-sm text-fg-muted">No games match “{q.trim()}”.</p>
          ) : (
            visible.map((it, i) => (
              <button
                key={it.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(it)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left", i === active ? "bg-raised" : "hover:bg-raised")}
              >
                <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md bg-overlay">
                  {it.cover ? <Image src={it.cover} alt="" fill sizes="64px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{it.title}</span>
                  {it.category ? <span className="block text-xs text-fg-subtle">{it.category}</span> : null}
                </span>
              </button>
            ))
          )}
          {q.trim() ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go()}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-3 py-2.5 text-sm text-fg-muted hover:bg-raised hover:text-fg"
            >
              <Search className="size-4" /> See all results for “{q.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

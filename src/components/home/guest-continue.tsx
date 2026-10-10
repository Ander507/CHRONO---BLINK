"use client";

import { History, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { SectionHeader } from "@/components/ui/misc";
import { clearRecent, getRecent } from "@/lib/local";
import { timeAgo } from "@/lib/utils";

type Card = { id: string; slug: string; title: string; cover: string | null; category: { name: string } | null };

/** Guests' history lives on their device; this renders it without any server-side tracking. */
export function GuestContinuePlaying() {
  const [items, setItems] = React.useState<{ game: Card; at: number }[] | null>(null);

  React.useEffect(() => {
    const recent = getRecent();
    if (recent.length === 0) return;
    fetch(`/api/games/cards?slugs=${recent.map((r) => r.slug).join(",")}`)
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((d: { games: Card[] }) => {
        const bySlug = new Map(d.games.map((g) => [g.slug, g]));
        setItems(recent.flatMap((r) => (bySlug.has(r.slug) ? [{ game: bySlug.get(r.slug)!, at: r.at }] : [])));
      })
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="continue-heading">
      <SectionHeader
        id="continue-heading"
        title="Continue playing"
        subtitle="Saved on this device"
        action={
          <button
            type="button"
            className="text-xs font-semibold text-fg-subtle hover:text-fg"
            onClick={() => {
              clearRecent();
              setItems([]);
            }}
          >
            Clear history
          </button>
        }
      />
      <ContinueRow items={items.slice(0, 6)} />
    </section>
  );
}

export function ContinueRow({ items }: { items: { game: Card; at: number | null }[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {items.map(({ game, at }) => (
        <Link
          key={game.id}
          href={`/play/${game.slug}`}
          className="group flex w-[260px] shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pr-4 transition hover:border-line-strong hover:bg-raised"
        >
          <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-overlay">
            {game.cover ? <Image src={game.cover} alt="" fill sizes="96px" className="object-cover" /> : null}
            <span className="absolute inset-0 grid place-items-center bg-ink/50 opacity-0 transition group-hover:opacity-100">
              <Play className="size-5 fill-white text-white" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-fg">{game.title}</span>
            <span className="flex items-center gap-1 text-xs text-fg-subtle">
              <History className="size-3" />
              {at ? timeAgo(new Date(at)) : (game.category?.name ?? "Resume")}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

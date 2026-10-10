import Link from "next/link";
import { NamedIcon } from "@/components/brand";
import { cn } from "@/lib/utils";

const TINTS = ["#8b6cff", "#3cc4ff", "#f472b6", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#22d3ee", "#f97316", "#84cc16"];

export function CategoryTiles({
  categories,
  className,
}: {
  categories: { id: number; slug: string; name: string; icon: string; count: number }[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {categories.map((c, i) => {
        const tint = TINTS[i % TINTS.length]!;
        return (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-line-strong motion-reduce:transform-none"
          >
            <span
              className="absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
              style={{ background: tint }}
              aria-hidden
            />
            <span className="relative grid size-10 place-items-center rounded-xl [&_svg]:size-5" style={{ background: `${tint}22`, color: tint }}>
              <NamedIcon name={c.icon} />
            </span>
            <span className="relative mt-3 block font-display text-[15px] font-bold text-fg">{c.name}</span>
            <span className="relative text-xs text-fg-subtle">
              {c.count === 0 ? "No games yet" : `${c.count} ${c.count === 1 ? "game" : "games"}`}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

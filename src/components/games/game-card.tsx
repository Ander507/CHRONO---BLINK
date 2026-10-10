import { Monitor, Play, Smartphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "@/components/games/favorite-button";
import { cn } from "@/lib/utils";
import type { GameCard as GameCardData } from "@/server/services/catalog";

export function GameCard({
  game,
  favorite,
  signedIn,
  priority,
  className,
  sizes = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 80vw",
}: {
  game: GameCardData;
  favorite: boolean;
  signedIn: boolean;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <article className={cn("group relative", className)}>
      <Link
        href={`/play/${game.slug}`}
        className="block rounded-2xl focus-visible:outline-offset-4"
        aria-label={`Play ${game.title}`}
      >
        <div
          className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-raised shadow-[var(--shadow-card)] transition duration-300 group-hover:-translate-y-1 group-hover:border-line-strong group-hover:shadow-[var(--shadow-lift)] motion-reduce:transform-none"
          style={{ ["--accent" as string]: game.accentColor }}
        >
          {game.cover ? (
            <Image
              src={game.cover}
              alt=""
              fill
              sizes={sizes}
              priority={priority}
              className="object-cover transition duration-500 group-hover:scale-[1.04] motion-reduce:transform-none"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-overlay to-ink font-display text-2xl font-extrabold text-fg-subtle">
              {game.title}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <span className="absolute bottom-3 left-3 inline-flex translate-y-2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <Play className="size-3.5 fill-current" /> Play now
          </span>
        </div>
      </Link>
      <FavoriteButton
        gameId={game.id}
        title={game.title}
        initial={favorite}
        signedIn={signedIn}
        className="absolute right-2.5 top-2.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:aria-pressed:opacity-100"
      />
      <div className="mt-3 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[15px] font-bold text-fg">
            <Link href={`/play/${game.slug}`} className="hover:text-primary-hover" tabIndex={-1}>
              {game.title}
            </Link>
          </h3>
          {game.category ? (
            <Link href={`/category/${game.category.slug}`} className="text-xs font-medium text-fg-subtle hover:text-fg-muted">
              {game.category.name}
            </Link>
          ) : null}
        </div>
        <div className="mt-1 flex shrink-0 gap-1.5 text-fg-subtle" aria-label={deviceLabel(game)}>
          {game.supportsDesktop ? <Monitor className="size-3.5" aria-hidden /> : null}
          {game.supportsMobile ? <Smartphone className="size-3.5" aria-hidden /> : null}
        </div>
      </div>
    </article>
  );
}

function deviceLabel(g: GameCardData) {
  if (g.supportsDesktop && g.supportsMobile) return "Plays on desktop and mobile";
  if (g.supportsMobile) return "Plays on mobile";
  return "Desktop only";
}

export function GameGrid({
  games,
  favorites,
  signedIn,
  className,
}: {
  games: GameCardData[];
  favorites: Set<string>;
  signedIn: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", className)}>
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} favorite={favorites.has(g.id)} signedIn={signedIn} priority={i < 2} />
      ))}
    </div>
  );
}

export function GameShelf({
  games,
  favorites,
  signedIn,
}: {
  games: GameCardData[];
  favorites: Set<string>;
  signedIn: boolean;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
      {games.map((g) => (
        <GameCard
          key={g.id}
          game={g}
          favorite={favorites.has(g.id)}
          signedIn={signedIn}
          className="w-[78vw] max-w-[340px] shrink-0 snap-start sm:w-[300px]"
          sizes="340px"
        />
      ))}
    </div>
  );
}

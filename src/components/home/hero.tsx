"use client";

import { ChevronLeft, ChevronRight, Monitor, Play, Smartphone } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { FavoriteButton } from "@/components/games/favorite-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type HeroGame = {
  id: string;
  slug: string;
  title: string;
  headline: string | null;
  shortDescription: string;
  cover: string | null;
  accentColor: string;
  category: { slug: string; name: string } | null;
  tags: string[];
  supportsDesktop: boolean;
  supportsMobile: boolean;
  sponsored: boolean;
  sponsorName: string | null;
  favorite: boolean;
};

export function FeaturedHero({ games, signedIn }: { games: HeroGame[]; signedIn: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = useReducedMotion();
  const count = games.length;

  React.useEffect(() => {
    if (count < 2 || paused || reduce) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 8000);
    return () => clearInterval(t);
  }, [count, paused, reduce]);

  if (count === 0) return null;
  const g = games[index]!;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured games"
      className="relative overflow-hidden rounded-3xl border border-line bg-ink shadow-[var(--shadow-lift)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] min-[480px]:aspect-[16/10] lg:aspect-[21/9]">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={g.id}
            className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {g.cover ? <Image src={g.cover} alt="" fill priority={index === 0} sizes="(min-width: 1024px) 80vw, 100vw" className="object-cover" /> : null}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent lg:bg-gradient-to-r lg:from-ink lg:via-ink/70 lg:to-transparent" />
        <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(60% 80% at 0% 100%, ${g.accentColor}33, transparent 70%)` }} />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 sm:p-8 lg:inset-y-0 lg:max-w-xl lg:justify-center lg:p-12">
          <div className="flex flex-wrap items-center gap-2">
            {g.sponsored ? (
              <Badge tone="warning">Sponsored{g.sponsorName ? ` · ${g.sponsorName}` : ""}</Badge>
            ) : (
              <Badge tone="primary">Featured</Badge>
            )}
            {g.category ? (
              <Link href={`/category/${g.category.slug}`}>
                <Badge className="hover:text-fg">{g.category.name}</Badge>
              </Link>
            ) : null}
            {g.tags.slice(0, 2).map((t) => (
              <Badge key={t} className="hidden sm:inline-flex">
                {t}
              </Badge>
            ))}
          </div>
          <div>
            <h2 className="text-balance font-display text-3xl font-extrabold leading-[1.05] text-white sm:text-5xl">{g.title}</h2>
            {g.headline ? <p className="mt-2 font-display text-lg font-semibold text-white/85 sm:text-xl">{g.headline}</p> : null}
            <p className="mt-3 line-clamp-3 max-w-md text-sm text-white/70 sm:text-base">{g.shortDescription}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="lg" className="px-7">
              <Link href={`/play/${g.slug}`}>
                <Play className="fill-current" /> Play now
              </Link>
            </Button>
            <FavoriteButton gameId={g.id} title={g.title} initial={g.favorite} signedIn={signedIn} className="size-12" />
            <span className="ml-1 flex gap-2 text-white/60" aria-label="Supported devices">
              {g.supportsDesktop ? <Monitor className="size-4" aria-label="Desktop" /> : null}
              {g.supportsMobile ? <Smartphone className="size-4" aria-label="Mobile" /> : null}
            </span>
          </div>
        </div>

        {count > 1 ? (
          <div className="absolute right-4 top-4 flex items-center gap-2 sm:bottom-6 sm:right-6 sm:top-auto">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full bg-ink/60 text-white/90 backdrop-blur hover:bg-ink/90"
              aria-label="Previous featured game"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex gap-1.5" role="tablist" aria-label="Choose featured game">
              {games.map((x, i) => (
                <button
                  key={x.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={x.title}
                  onClick={() => setIndex(i)}
                  className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70")}
                />
              ))}
            </div>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full bg-ink/60 text-white/90 backdrop-blur hover:bg-ink/90"
              aria-label="Next featured game"
              onClick={() => setIndex((i) => (i + 1) % count)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

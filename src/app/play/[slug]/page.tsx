import { CheckCircle2, ChevronRight, Lock, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdUnit } from "@/components/ads";
import { NamedIcon } from "@/components/brand";
import { GameCard } from "@/components/games/game-card";
import { FavoriteButton } from "@/components/games/favorite-button";
import { ReportDialog, ShareButton } from "@/components/player/game-actions";
import { PlayExperience } from "@/components/player/play-experience";
import { Badge, Progress } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils";
import { env } from "@/server/env";
import { getCurrentUser } from "@/server/session";
import { displaySlot } from "@/server/services/ads";
import { favoriteIds, getGameBySlug, relatedGames, weeklyPlays } from "@/server/services/catalog";
import { getLeaderboardDefs, getPlayerStanding, getTopScores } from "@/server/services/leaderboards";
import { achievementsForUser } from "@/server/services/profiles";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGameBySlug(slug);
  if (!g || (g.status !== "published" && g.status !== "unlisted")) return { title: "Game not found", robots: { index: false } };
  const title = `Play ${g.title} free online`;
  return {
    title,
    description: g.shortDescription,
    alternates: { canonical: `/play/${g.slug}` },
    robots: g.status === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: `${g.title} — ChronoBlink Arcade`,
      description: g.shortDescription,
      url: `/play/${g.slug}`,
      type: "website",
      images: g.cover ? [{ url: g.cover, width: 1920, height: 1080, alt: g.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title: `${g.title} — ChronoBlink Arcade`, description: g.shortDescription, images: g.cover ? [g.cover] : undefined },
  };
}

export default async function PlayPage({ params }: Props) {
  const { slug } = await params;
  const g = await getGameBySlug(slug);
  if (!g) notFound();
  if (g.status === "removed") return <RemovedGame title={g.title} reason={g.statusReason} />;
  if ((g.status !== "published" && g.status !== "unlisted") || !g.liveVersion) notFound();

  const user = await getCurrentUser();
  const [defs, related, favs, achievementList, plays, sidebarAd] = await Promise.all([
    getLeaderboardDefs(g.id),
    relatedGames(g, 4),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
    achievementsForUser(user?.id ?? null, g.id),
    weeklyPlays(g.id),
    displaySlot("game_sidebar"),
  ]);
  const main = defs.find((d) => d.key === "highscore") ?? defs[0];
  const lbInitial = main
    ? {
        board: { title: main.title, verification: main.verification },
        rows: (await getTopScores(main.id, "all", 10)).map((r) => ({ ...r, isMe: r.userId === user?.id })),
        me: user ? await getPlayerStanding(main.id, user.id, "all") : null,
      }
    : null;

  const entryUrl = `${env.GAME_ORIGIN}/g/${g.id}/${g.liveVersion.id}/index.html`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: g.title,
    description: g.shortDescription,
    url: `${env.APP_URL}/play/${g.slug}`,
    image: g.cover ? `${env.APP_URL}${g.cover}` : undefined,
    genre: g.category?.name,
    keywords: g.tags.join(", "),
    gamePlatform: ["Web browser", ...(g.supportsMobile ? ["Mobile web"] : [])],
    applicationCategory: "Game",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: g.developer?.studioName ?? g.creditName ?? "ChronoBlink" },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: env.APP_URL },
      ...(g.category ? [{ "@type": "ListItem", position: 2, name: g.category.name, item: `${env.APP_URL}/category/${g.category.slug}` }] : []),
      { "@type": "ListItem", position: g.category ? 3 : 2, name: g.title, item: `${env.APP_URL}/play/${g.slug}` },
    ],
  };
  const unlockedCount = achievementList.filter((a) => a.unlockedAt).length;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbLd]).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs font-medium text-fg-subtle">
        <Link href="/" className="hover:text-fg">
          Home
        </Link>
        {g.category ? (
          <>
            <ChevronRight className="size-3" />
            <Link href={`/category/${g.category.slug}`} className="hover:text-fg">
              {g.category.name}
            </Link>
          </>
        ) : null}
        <ChevronRight className="size-3" />
        <span className="text-fg-muted" aria-current="page">
          {g.title}
        </span>
      </nav>

      <PlayExperience
        signedIn={Boolean(user)}
        leaderboard={lbInitial}
        game={{
          id: g.id,
          slug: g.slug,
          title: g.title,
          entryUrl,
          cover: g.cover,
          accentColor: g.accentColor,
          orientation: g.orientation,
          supportsMobile: g.supportsMobile,
          leaderboards: defs.map((d) => d.key),
          hasAchievements: achievementList.some((a) => a.gameId),
        }}
        header={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold text-fg sm:text-3xl">{g.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span>by {g.developer?.studioName ?? g.creditName ?? "Independent developer"}</span>
                {g.category ? (
                  <Link href={`/category/${g.category.slug}`}>
                    <Badge className="hover:text-fg">{g.category.name}</Badge>
                  </Link>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  {g.supportsDesktop ? <Monitor className="size-3.5" aria-label="Desktop" /> : null}
                  {g.supportsMobile ? <Smartphone className="size-3.5" aria-label="Mobile" /> : null}
                </span>
                {plays > 0 ? <span>{formatNumber(plays)} plays this week</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <FavoriteButton gameId={g.id} title={g.title} initial={favs.has(g.id)} signedIn={Boolean(user)} variant="toolbar" />
              <ShareButton title={g.title} url={`/play/${g.slug}`} />
              <ReportDialog gameId={g.id} title={g.title} />
            </div>
          </div>
        }
        aside={
          <>
            {achievementList.length > 0 ? (
              <section className="surface p-4" aria-labelledby="ach-heading">
                <div className="mb-3 flex items-center justify-between">
                  <h2 id="ach-heading" className="font-display text-lg font-bold text-fg">
                    Achievements
                  </h2>
                  {user ? (
                    <span className="text-xs font-semibold text-fg-subtle">
                      {unlockedCount}/{achievementList.length}
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-2.5">
                  {achievementList.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4 ${a.unlockedAt ? "bg-primary-soft text-primary-hover" : "bg-raised text-fg-subtle"}`}
                      >
                        {a.unlockedAt ? <NamedIcon name={a.icon} /> : <Lock />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                          {a.title}
                          {a.unlockedAt ? <CheckCircle2 className="size-3.5 text-success" aria-label="Unlocked" /> : null}
                        </p>
                        <p className="text-xs text-fg-muted">{a.description}</p>
                        {a.progress && !a.unlockedAt && a.progress[1] > 1 ? (
                          <Progress value={a.progress[0] / a.progress[1]} className="mt-1.5 h-1" label={`${a.title} progress`} />
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-fg-subtle">+{a.xp} XP</span>
                    </li>
                  ))}
                </ul>
                {!user ? <p className="mt-3 text-xs text-fg-subtle">Sign in to unlock achievements and earn XP.</p> : null}
              </section>
            ) : null}
            <AdUnit slot={sidebarAd} />
            {related.length > 0 ? (
              <section aria-labelledby="related-heading">
                <h2 id="related-heading" className="mb-3 font-display text-lg font-bold text-fg">
                  You might also like
                </h2>
                <div className="grid gap-5 min-[480px]:grid-cols-2 xl:grid-cols-1">
                  {related.map((r) => (
                    <GameCard key={r.id} game={r} favorite={favs.has(r.id)} signedIn={Boolean(user)} sizes="340px" />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface p-5" aria-labelledby="about-heading">
            <h2 id="about-heading" className="font-display text-lg font-bold text-fg">
              About {g.title}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg-muted">
              {g.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {g.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {g.tags.map((t) => (
                  <Link key={t} href={`/search?q=${encodeURIComponent(t)}`}>
                    <Badge className="normal-case hover:text-fg">#{t}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
          <section className="surface p-5" aria-labelledby="howto-heading">
            <h2 id="howto-heading" className="font-display text-lg font-bold text-fg">
              How to play
            </h2>
            {g.instructions ? <p className="mt-3 text-sm leading-relaxed text-fg-muted">{g.instructions}</p> : null}
            {g.controls.length ? (
              <dl className="mt-4 divide-y divide-line rounded-xl border border-line">
                {g.controls.map((c) => (
                  <div key={c.action} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                    <dt className="font-semibold text-fg">{c.action}</dt>
                    <dd className="text-right text-fg-muted">{c.keys}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="mt-4 flex items-start gap-2 text-xs text-fg-subtle">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
              Runs in an isolated sandbox on a separate domain — the game can&apos;t see your account, cookies or other games.
            </p>
          </section>
        </div>
      </PlayExperience>
    </>
  );
}

function RemovedGame({ title, reason }: { title: string; reason: string | null }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="font-display text-3xl font-extrabold text-fg">{title} is no longer available</h1>
      <p className="mt-3 text-fg-muted">{reason ?? "This game has been removed from ChronoBlink Arcade."}</p>
      <Link href="/games" className="mt-6 inline-block font-semibold text-electric hover:underline">
        Browse other games →
      </Link>
    </div>
  );
}

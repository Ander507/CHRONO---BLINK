import { Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NamedIcon } from "@/components/brand";
import { CatalogControls } from "@/components/games/catalog-controls";
import { GameGrid } from "@/components/games/game-card";
import { Pagination } from "@/components/games/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { parseCatalogParams, type CatalogSearchParams } from "@/lib/catalog-params";
import { env } from "@/server/env";
import { getCurrentUser } from "@/server/session";
import { favoriteIds, getCategory, listGames } from "@/server/services/catalog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<CatalogSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return { title: "Category not found" };
  const { total } = await listGames({ categorySlug: c.slug, pageSize: 1 });
  return {
    title: `${c.name} games — play free online`,
    description: `${c.description} Play ${c.name.toLowerCase()} games instantly in your browser on ChronoBlink Arcade.`,
    alternates: { canonical: `/category/${c.slug}` },
    // Don't ask search engines to index empty category pages.
    robots: total === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await getCategory(slug);
  if (!c) notFound();
  const { sort, device, page } = parseCatalogParams(sp);
  const user = await getCurrentUser();
  const [result, favs] = await Promise.all([
    listGames({ categorySlug: c.slug, sort, device, page }),
    user ? favoriteIds(user.id) : Promise.resolve(new Set<string>()),
  ]);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: env.APP_URL },
      { "@type": "ListItem", position: 2, name: "Categories", item: `${env.APP_URL}/categories` },
      { "@type": "ListItem", position: 3, name: c.name, item: `${env.APP_URL}/category/${c.slug}` },
    ],
  };
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs font-medium text-fg-subtle">
        <Link href="/" className="hover:text-fg">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/categories" className="hover:text-fg">
          Categories
        </Link>{" "}
        / <span className="text-fg-muted">{c.name}</span>
      </nav>
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-hover [&_svg]:size-7">
            <NamedIcon name={c.icon} />
          </span>
          <div>
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">{c.name} games</h1>
            <p className="mt-1.5 max-w-2xl text-fg-muted">{c.description}</p>
          </div>
        </div>
        {result.total > 0 ? (
          <Suspense>
            <CatalogControls />
          </Suspense>
        ) : null}
      </header>
      {result.games.length ? (
        <GameGrid games={result.games} favorites={favs} signedIn={Boolean(user)} />
      ) : (
        <EmptyState
          icon={<Gamepad2 />}
          title={result.total === 0 ? `No ${c.name.toLowerCase()} games yet` : "No games match these filters"}
          action={
            result.total === 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="secondary">
                  <Link href="/games">Browse all games</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/developers">Publish a {c.name.toLowerCase()} game</Link>
                </Button>
              </div>
            ) : null
          }
        >
          {result.total === 0
            ? "We only list real, playable games — nothing in this category has been published yet."
            : "Try another device filter."}
        </EmptyState>
      )}
      <Pagination page={result.page} pages={result.pages} basePath={`/category/${c.slug}`} params={{ ...sp }} />
    </div>
  );
}

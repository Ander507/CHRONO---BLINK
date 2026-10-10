import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { allPublishedForSitemap, categoriesWithCounts } from "@/server/services/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;
  const [games, cats] = await Promise.all([allPublishedForSitemap(), categoriesWithCounts()]);
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/games`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/new`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/trending`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/leaderboards`, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/challenges`, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/developers`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/developers/docs`, changeFrequency: "monthly", priority: 0.4 },
    // Only categories with real games — no thin pages.
    ...cats.filter((c) => c.count > 0).map((c) => ({ url: `${base}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...games.flatMap((g) => [
      { url: `${base}/play/${g.slug}`, lastModified: g.updatedAt, changeFrequency: "weekly" as const, priority: 0.9 },
      { url: `${base}/leaderboards/${g.slug}`, changeFrequency: "daily" as const, priority: 0.4 },
    ]),
  ];
}

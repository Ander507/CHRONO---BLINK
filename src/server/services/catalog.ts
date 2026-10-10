import "server-only";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, favorites, featuredPlacements, gameSessions, games } from "@/server/db/schema";
import { cached } from "@/server/cache";
import { mediaUrl } from "@/server/services/storage";

/** What a game card needs. Kept small: shelves render many of these. */
export type GameCard = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  cover: string | null;
  coverPortrait: string | null;
  accentColor: string;
  category: { slug: string; name: string } | null;
  tags: string[];
  supportsDesktop: boolean;
  supportsMobile: boolean;
  publishedAt: Date | null;
};

const cardColumns = {
  id: games.id,
  slug: games.slug,
  title: games.title,
  shortDescription: games.shortDescription,
  coverKey: games.coverKey,
  coverPortraitKey: games.coverPortraitKey,
  accentColor: games.accentColor,
  tags: games.tags,
  supportsDesktop: games.supportsDesktop,
  supportsMobile: games.supportsMobile,
  publishedAt: games.publishedAt,
  categorySlug: categories.slug,
  categoryName: categories.name,
};
type CardRow = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  coverKey: string | null;
  coverPortraitKey: string | null;
  accentColor: string;
  tags: string[];
  supportsDesktop: boolean;
  supportsMobile: boolean;
  publishedAt: Date | null;
  categorySlug: string | null;
  categoryName: string | null;
};
function toCard(r: CardRow): GameCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: r.shortDescription,
    cover: mediaUrl(r.coverKey),
    coverPortrait: mediaUrl(r.coverPortraitKey),
    accentColor: r.accentColor,
    category: r.categorySlug ? { slug: r.categorySlug, name: r.categoryName ?? r.categorySlug } : null,
    tags: r.tags,
    supportsDesktop: r.supportsDesktop,
    supportsMobile: r.supportsMobile,
    publishedAt: r.publishedAt,
  };
}

const playable = and(eq(games.status, "published"), sql`${games.liveVersionId} is not null`);

function cardQuery() {
  return db.select(cardColumns).from(games).leftJoin(categories, eq(categories.id, games.categoryId));
}

export type Sort = "new" | "popular" | "az";
export type DeviceFilter = "desktop" | "mobile" | null;

/**
 * Trending score (documented in docs/ARCHITECTURE.md#trending):
 *   Σ over sessions in the last 7 days of  weight × 0.5^(age_hours / 48)
 *   weight = 1.0 if the session had ≥ 30 s of active play, 0.25 if ≥ 5 s, else 0
 * Only sessions whose game actually loaded count. Session creation is rate
 * limited per IP, which bounds how much one client can move the ranking.
 */
const trendingScore = sql<number>`coalesce((
  select sum(
    (case when s.active_seconds >= 30 then 1.0 when s.active_seconds >= 5 then 0.25 else 0 end)
    * power(0.5, extract(epoch from (now() - s.started_at)) / 3600.0 / 48.0)
  )
  from game_sessions s
  where s.game_id = "games"."id" and s.load_state = 'loaded' and s.started_at > now() - interval '7 days'
), 0)`;

/** Plays (sessions with ≥ 5 s active play) in the last 7 days. */
export async function weeklyPlays(gameId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.gameId, gameId),
        eq(gameSessions.loadState, "loaded"),
        gt(gameSessions.activeSeconds, 4),
        gt(gameSessions.startedAt, sql`now() - interval '7 days'`),
      ),
    );
  return Number(r?.n ?? 0);
}

export async function listGames(opts: {
  categorySlug?: string;
  sort?: Sort;
  device?: DeviceFilter;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = Math.min(48, Math.max(1, opts.pageSize ?? 24));
  const page = Math.max(1, opts.page ?? 1);
  const where: (SQL | undefined)[] = [playable];
  if (opts.categorySlug) where.push(eq(categories.slug, opts.categorySlug));
  if (opts.device === "mobile") where.push(eq(games.supportsMobile, true));
  if (opts.device === "desktop") where.push(eq(games.supportsDesktop, true));
  const q = opts.q?.trim().slice(0, 80);
  let relevance: SQL<number> | null = null;
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(games.title, like),
        ilike(games.shortDescription, like),
        ilike(games.description, like),
        ilike(categories.name, like),
        sql`exists (select 1 from unnest(${games.tags}) t where t ilike ${like})`,
      ),
    );
    relevance = sql<number>`(case when ${games.title} ilike ${`${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`} then 3 when ${games.title} ilike ${like} then 2 when exists (select 1 from unnest(${games.tags}) t where t ilike ${like}) then 1 else 0 end)`;
  }
  const order =
    opts.sort === "az"
      ? [asc(games.title)]
      : opts.sort === "popular"
        ? [desc(trendingScore), desc(games.publishedAt)]
        : [desc(games.publishedAt), asc(games.title)];
  const filter = and(...where);
  const [rows, [total]] = await Promise.all([
    cardQuery()
      .where(filter)
      .orderBy(...(relevance ? [desc(relevance)] : []), ...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(games).leftJoin(categories, eq(categories.id, games.categoryId)).where(filter),
  ]);
  const totalCount = Number(total?.n ?? 0);
  return { games: rows.map(toCard), total: totalCount, page, pageSize, pages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}

export async function searchSuggestions(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 1) return [];
  const { games: list } = await listGames({ q: term, pageSize: 6 });
  return list.map((g) => ({ slug: g.slug, title: g.title, cover: g.cover, category: g.category?.name ?? null }));
}

/** Games with genuine play activity in the last week, ranked by trending score. Empty if nobody played. */
export async function trendingGames(limit = 12) {
  return cached(`catalog:trending:${limit}`, 60_000, async () => {
    const rows = await cardQuery()
      .where(and(playable, sql`${trendingScore} > 0`))
      .orderBy(desc(trendingScore))
      .limit(limit);
    return rows.map(toCard);
  });
}

export async function newGames(limit = 12) {
  return cached(`catalog:new:${limit}`, 60_000, async () => {
    const rows = await cardQuery().where(playable).orderBy(desc(games.publishedAt)).limit(limit);
    return rows.map(toCard);
  });
}

export async function featuredGames() {
  return cached("catalog:featured", 60_000, async () => {
    const now = new Date();
    const rows = await db
      .select({
        ...cardColumns,
        description: games.description,
        headline: featuredPlacements.headline,
        sponsored: featuredPlacements.sponsored,
        sponsorName: featuredPlacements.sponsorName,
      })
      .from(featuredPlacements)
      .innerJoin(games, eq(games.id, featuredPlacements.gameId))
      .leftJoin(categories, eq(categories.id, games.categoryId))
      .where(
        and(
          playable,
          eq(featuredPlacements.slot, "hero"),
          or(isNull(featuredPlacements.startsAt), lte(featuredPlacements.startsAt, now)),
          or(isNull(featuredPlacements.endsAt), gt(featuredPlacements.endsAt, now)),
        ),
      )
      .orderBy(asc(featuredPlacements.sortOrder), asc(featuredPlacements.id))
      .limit(5);
    return rows.map((r) => ({
      ...toCard(r),
      description: r.description,
      headline: r.headline,
      sponsored: r.sponsored,
      sponsorName: r.sponsorName,
    }));
  });
}

export async function categoriesWithCounts() {
  return cached("catalog:categories", 60_000, async () => {
    const rows = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        icon: categories.icon,
        count: sql<number>`(select count(*) from games g where g.category_id = "categories"."id" and g.status = 'published' and g.live_version_id is not null)::int`,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  });
}

export async function getCategory(slug: string) {
  return db.query.categories.findFirst({ where: eq(categories.slug, slug) });
}

export type GameDetail = NonNullable<Awaited<ReturnType<typeof getGameBySlug>>>;

/** Full game record for /play/[slug]. Returns non-public games too; callers decide visibility. */
export async function getGameBySlug(slug: string) {
  const g = await db.query.games.findFirst({
    where: eq(games.slug, slug),
    with: { category: true, developer: { columns: { studioName: true, userId: true } }, liveVersion: true },
  });
  if (!g) return null;
  return { ...g, cover: mediaUrl(g.coverKey), coverPortrait: mediaUrl(g.coverPortraitKey) };
}

export async function relatedGames(game: { id: string; categoryId: number | null; tags: string[] }, limit = 6) {
  const rows = await cardQuery()
    .where(and(playable, ne(games.id, game.id)))
    .orderBy(
      desc(sql`(case when ${games.categoryId} = ${game.categoryId ?? -1} then 2 else 0 end) + coalesce(cardinality(array(select unnest(${games.tags}) intersect select unnest(${sql.param(game.tags)}::text[]))), 0)`),
      desc(trendingScore),
      desc(games.publishedAt),
    )
    .limit(limit);
  return rows.map(toCard);
}

export async function gamesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await cardQuery().where(and(playable, inArray(games.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((g): g is GameCard => Boolean(g));
}

export async function gamesBySlugs(slugs: string[]) {
  if (slugs.length === 0) return [];
  const rows = await cardQuery().where(and(playable, inArray(games.slug, slugs.slice(0, 24))));
  const bySlug = new Map(rows.map((r) => [r.slug, toCard(r)]));
  return slugs.map((s) => bySlug.get(s)).filter((g): g is GameCard => Boolean(g));
}

/** Most recently played games for a signed-in player (one row per game). */
export async function recentlyPlayed(userId: string, limit = 8) {
  const rows = await db.execute<{ game_id: string }>(sql`
    select game_id from (
      select game_id, max(started_at) as last from game_sessions
      where user_id = ${userId} group by game_id
    ) t order by last desc limit ${limit}
  `);
  return gamesByIds(rows.map((r) => r.game_id));
}

export async function favoriteGames(userId: string) {
  const rows = await cardQuery()
    .innerJoin(favorites, and(eq(favorites.gameId, games.id), eq(favorites.userId, userId)))
    .where(playable)
    .orderBy(desc(favorites.createdAt));
  return rows.map(toCard);
}

export async function favoriteIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: favorites.gameId }).from(favorites).where(eq(favorites.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Deterministic recommendations — no trained model:
 *   1. Take the categories (×2) and tags (×1) of what the player recently
 *      played and favourited ("seed" games).
 *   2. Score every other playable game by overlap with those, then by
 *      trending score, then recency.
 *   3. Exclude the seed games themselves. With no history, fall back to
 *      trending, then newest.
 */
export async function recommendations(opts: { userId?: string | null; recentSlugs?: string[]; limit?: number }) {
  const limit = opts.limit ?? 8;
  const seedIds = new Set<string>();
  if (opts.userId) {
    const recent = await recentlyPlayed(opts.userId, 10);
    recent.forEach((g) => seedIds.add(g.id));
    (await favoriteIds(opts.userId)).forEach((id) => seedIds.add(id));
  }
  if (opts.recentSlugs?.length) (await gamesBySlugs(opts.recentSlugs.slice(0, 10))).forEach((g) => seedIds.add(g.id));

  const seeds = seedIds.size
    ? await db
        .select({ id: games.id, categoryId: games.categoryId, tags: games.tags })
        .from(games)
        .where(inArray(games.id, [...seedIds]))
    : [];
  const catIds = [...new Set(seeds.map((s) => s.categoryId).filter((c): c is number => c != null))];
  const tags = [...new Set(seeds.flatMap((s) => s.tags))];

  const affinity =
    seeds.length > 0
      ? sql<number>`(case when ${games.categoryId} = any(${sql.param(catIds)}::int[]) then 2 else 0 end) + coalesce(cardinality(array(select unnest(${games.tags}) intersect select unnest(${sql.param(tags)}::text[]))), 0)`
      : sql<number>`0::int`;
  const rows = await cardQuery()
    .where(and(playable, seedIds.size ? sql`${games.id} <> all(${sql.param([...seedIds])}::uuid[])` : undefined))
    .orderBy(desc(affinity), desc(trendingScore), desc(games.publishedAt))
    .limit(limit);
  return { games: rows.map(toCard), personalised: seeds.length > 0 };
}

export async function allPublishedForSitemap() {
  return db
    .select({ slug: games.slug, updatedAt: games.updatedAt })
    .from(games)
    .where(playable)
    .orderBy(asc(games.slug));
}

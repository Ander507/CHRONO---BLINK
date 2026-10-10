/**
 * Seeds genuine starter content: categories, the three first-party games
 * (built from ./games/<slug>), their leaderboards, achievements, daily
 * challenge definitions and default (disabled) ad placements.
 *
 * Idempotent: re-running updates listings and publishes a new build version
 * only when a game's files changed. It never creates users or fake activity.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { contentTypeFor, createStorageFromEnv } from "../src/server/storage/driver";
import { GAME_META_FILE, publishedPrefix } from "../src/server/game-host-policy";

const {
  categories,
  games,
  gameVersions,
  leaderboardDefinitions,
  achievements,
  challengeDefinitions,
  featuredPlacements,
  adPlacements,
  AD_PLACEMENT_KEYS,
} = schema;

const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const storage = createStorageFromEnv();

const CATEGORIES = [
  { slug: "action", name: "Action", icon: "swords", description: "Fast reflexes, big moments. Games where every second counts." },
  { slug: "arcade", name: "Arcade", icon: "joystick", description: "Pick-up-and-play score chasers built for one more run." },
  { slug: "survival", name: "Survival", icon: "shield", description: "Outlast escalating threats for as long as you can." },
  { slug: "puzzle", name: "Puzzle", icon: "puzzle", description: "Think it through. Logic, patterns and clever solutions." },
  { slug: "racing", name: "Racing", icon: "gauge", description: "Speed, lines and photo finishes." },
  { slug: "strategy", name: "Strategy", icon: "brain", description: "Plan ahead, manage resources, outsmart the board." },
  { slug: "platformer", name: "Platformer", icon: "footprints", description: "Run, jump and master tricky movement." },
  { slug: "skill", name: "Skill & Timing", icon: "timer", description: "Precision games that reward perfect timing." },
  { slug: "multiplayer", name: "Multiplayer", icon: "users", description: "Play with and against other people." },
  { slug: "idle", name: "Idle", icon: "hourglass", description: "Progress that keeps going while you take a break." },
];

type SeedGame = {
  slug: string;
  title: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  instructions: string;
  controls: schema.GameControl[];
  tags: string[];
  orientation: "landscape" | "portrait" | "any";
  supportsMobile: boolean;
  accentColor: string;
  cspExtraOrigins: string[];
  leaderboard: { maxScore: number; maxScorePerSecond: number; baseAllowance: number; minRunSeconds: number };
  achievements: { key: string; title: string; description: string; xp: number; icon: string; rule: schema.AchievementRule }[];
  challenges: { type: schema.ChallengeType; targets: number[]; titleTemplate: string; rewardXp: number }[];
  featured: { headline: string; sortOrder: number };
};

const GAMES: SeedGame[] = [
  {
    slug: "chrono-blink",
    title: "CHRONO // BLINK",
    categorySlug: "action",
    shortDescription: "Time only flows when you move. Blink-dash through the arena — your dash is both sword and exit.",
    description:
      "CHRONO // BLINK is a top-down arena where the world crawls at 8% speed while you stand still and surges to full speed the moment you move. Your blink-dash is a short invulnerable lunge: slice through a crimson stalker, an amber gunner or a violet phantom and the cooldown refunds instantly. Miss, and you're stuck in a 1.2-second lockout.\n\nChain cuts to build your combo multiplier, collect coins between waves, and spend them on Reach, Recovery and Magnet upgrades. Every run is a negotiation between planning in slow motion and committing to the dash.",
    instructions:
      "Stand still to slow time and plan. Move to let the world run. Blink through enemies to cut them — a hit refunds your dash, a miss costs 1.2 seconds. Keep cutting to grow the combo before it times out.",
    controls: [
      { action: "Move", keys: "WASD / ZQSD / Arrow keys · left thumb" },
      { action: "Blink-dash", keys: "Space or right click toward the reticle · right-side drag" },
      { action: "Pause", keys: "P" },
      { action: "Mute", keys: "M" },
      { action: "Skip tutorial", keys: "X" },
    ],
    tags: ["dash", "time", "neon", "combo", "arena"],
    orientation: "any",
    supportsMobile: true,
    accentColor: "#7de8d6",
    cspExtraOrigins: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    // Score = enemy value × combo; experts sustain a few hundred points per second with spikes from long chains.
    leaderboard: { maxScore: 10_000_000, maxScorePerSecond: 6_000, baseAllowance: 3_000, minRunSeconds: 5 },
    achievements: [
      { key: "blink_initiate", title: "Blink Initiate", description: "Score 5,000 points in a single run of CHRONO // BLINK.", xp: 40, icon: "zap", rule: { type: "score_at_least", leaderboard: "highscore", score: 5_000 } },
      { key: "time_bender", title: "Time Bender", description: "Score 25,000 points in a single run of CHRONO // BLINK.", xp: 100, icon: "hourglass", rule: { type: "score_at_least", leaderboard: "highscore", score: 25_000 } },
    ],
    challenges: [
      { type: "score_at_least", targets: [3_000, 5_000, 8_000, 12_000], titleTemplate: "Score {target} points in CHRONO // BLINK", rewardXp: 100 },
      { type: "run_seconds_at_least", targets: [45, 60, 90], titleTemplate: "Survive {target} seconds in one CHRONO // BLINK run", rewardXp: 80 },
    ],
    featured: { headline: "Time only moves when you do.", sortOrder: 0 },
  },
  {
    slug: "neon-drift",
    title: "Neon Drift",
    categorySlug: "survival",
    shortDescription: "Thread a glowing craft through mines, lasers and homing sparks in a tight neon survival arena.",
    description:
      "Neon Drift is a compact arcade survival game about tight, slightly drifty movement. Mines drift in from the start, laser lines sweep the arena from twenty seconds, homing sparks hunt you from forty, and pulse rings arrive at sixty — every hazard telegraphs before it can hit you.\n\nCollect energy shards to chain bonus points, skim past danger for near-miss bonuses, and survive the SURGE waves that push the speed to double. Runs are short, restarts are instant.",
    instructions: "Steer with inertia — the craft drifts a little, so plan your lines. Grab shards in quick succession to build a chain, and brush past hazards for close-call points.",
    controls: [
      { action: "Move", keys: "WASD / ZQSD / Arrow keys · touch joystick (left side)" },
      { action: "Start / restart", keys: "Space, Enter or tap" },
      { action: "Pause", keys: "P or Esc" },
      { action: "Mute", keys: "M" },
    ],
    tags: ["dodge", "neon", "arcade", "score attack"],
    orientation: "any",
    supportsMobile: true,
    accentColor: "#ec4899",
    cspExtraOrigins: [],
    // Hard design cap is 325 points per second of simulated time (see the game source).
    leaderboard: { maxScore: 2_000_000, maxScorePerSecond: 340, baseAllowance: 300, minRunSeconds: 3 },
    achievements: [
      { key: "survive_60", title: "One Minute Wonder", description: "Survive 60 seconds in a single Neon Drift run.", xp: 30, icon: "timer", rule: { type: "game_reported", minRunSeconds: 55 } },
      { key: "shard_collector", title: "Shard Collector", description: "Collect 25 shards in one Neon Drift run.", xp: 30, icon: "gem", rule: { type: "game_reported", minRunSeconds: 20 } },
      { key: "drift_10k", title: "Drift Master", description: "Score 10,000 points in Neon Drift.", xp: 60, icon: "sparkles", rule: { type: "score_at_least", leaderboard: "highscore", score: 10_000 } },
    ],
    challenges: [
      { type: "score_at_least", targets: [4_000, 6_000, 9_000, 14_000], titleTemplate: "Score {target} points in Neon Drift", rewardXp: 100 },
      { type: "runs_completed", targets: [3, 5], titleTemplate: "Finish {target} Neon Drift runs", rewardXp: 60 },
    ],
    featured: { headline: "Survive the surge.", sortOrder: 1 },
  },
  {
    slug: "pulse-stack",
    title: "Pulse Stack",
    categorySlug: "skill",
    shortDescription: "Drop sliding slabs with perfect timing. Nail perfects to keep your width and build a towering combo.",
    description:
      "Pulse Stack is a one-button precision stacker. A glowing slab sweeps over your tower — drop it at the right moment. Whatever overhangs is sliced away, so every mistake makes the next drop harder. Land a perfect and the slab snaps into place with a pulse, your combo climbs, and a run of perfects slowly grows the slab back.\n\nThe tower rises, the colours shift with height and the pace quickens. How high can you go?",
    instructions: "Tap, click or press Space to drop the moving slab. Line it up with the block below — perfect drops keep full width and build a combo.",
    controls: [
      { action: "Drop slab", keys: "Space / Enter / click / tap" },
      { action: "Pause", keys: "P" },
      { action: "Mute", keys: "M" },
    ],
    tags: ["one button", "timing", "stacking", "casual"],
    orientation: "portrait",
    supportsMobile: true,
    accentColor: "#60a5fa",
    cspExtraOrigins: [],
    // Hard design cap is ~16.7 points per second (5 points max per drop, 0.3 s minimum between drops).
    leaderboard: { maxScore: 1_000_000, maxScorePerSecond: 20, baseAllowance: 10, minRunSeconds: 3 },
    achievements: [
      { key: "perfect_5", title: "Perfect Pulse", description: "Land 5 perfect drops in a row in Pulse Stack.", xp: 30, icon: "target", rule: { type: "game_reported", minRunSeconds: 5 } },
      { key: "tower_50", title: "Skyscraper", description: "Place 50 slabs in one Pulse Stack run.", xp: 40, icon: "building", rule: { type: "game_reported", minRunSeconds: 30 } },
    ],
    challenges: [{ type: "score_at_least", targets: [30, 50, 80, 120], titleTemplate: "Score {target} points in Pulse Stack", rewardXp: 100 }],
    featured: { headline: "One button. Perfect timing.", sortOrder: 2 },
  },
];

const PLATFORM_ACHIEVEMENTS: { key: string; title: string; description: string; xp: number; icon: string; rule: schema.AchievementRule }[] = [
  { key: "first_game", title: "First Game Played", description: "Finish your first run of any game.", xp: 25, icon: "gamepad-2", rule: { type: "runs_completed", count: 1 } },
  { key: "first_high_score", title: "On the Board", description: "Post your first leaderboard score.", xp: 25, icon: "trophy", rule: { type: "first_leaderboard_entry" } },
  { key: "ten_runs", title: "Warmed Up", description: "Finish 10 runs across any games.", xp: 50, icon: "flame", rule: { type: "runs_completed", count: 10 } },
  { key: "five_games", title: "Explorer", description: "Play 5 different games.", xp: 75, icon: "compass", rule: { type: "distinct_games", count: 5 } },
  { key: "first_daily", title: "Daily Debut", description: "Complete your first daily challenge.", xp: 50, icon: "calendar-check", rule: { type: "challenges_completed", count: 1 } },
  { key: "seven_days", title: "Regular", description: "Play on 7 different days.", xp: 100, icon: "calendar-days", rule: { type: "distinct_days", count: 7 } },
  { key: "level_10", title: "Double Digits", description: "Reach level 10.", xp: 100, icon: "crown", rule: { type: "level", level: 10 } },
];

const SKIP = new Set(["media", "README.md", ".DS_Store", "Thumbs.db"]);

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

async function buildHash(dir: string, files: string[]) {
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(await readFile(path.join(dir, f)));
  }
  return h.digest("hex").slice(0, 16);
}

async function uploadMedia(gameId: string, file: string, label: string) {
  if (!existsSync(file)) return null;
  const buf = await readFile(file);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 10);
  const ext = path.extname(file).slice(1).toLowerCase();
  const key = `media/${gameId}/${label}-${hash}.${ext}`;
  if (!(await storage.exists(key))) await storage.put(key, buf, contentTypeFor(file));
  await db
    .insert(schema.gameAssets)
    .values({ gameId, kind: label === "cover" ? "cover" : "cover_portrait", storageKey: key, contentType: contentTypeFor(file), bytes: buf.length })
    .onConflictDoNothing();
  return key;
}

async function main() {
  console.log("[seed] categories");
  for (const [i, c] of CATEGORIES.entries()) {
    await db
      .insert(categories)
      .values({ ...c, sortOrder: i })
      .onConflictDoUpdate({ target: categories.slug, set: { name: c.name, icon: c.icon, description: c.description, sortOrder: i } });
  }
  const cats = new Map((await db.select().from(categories)).map((c) => [c.slug, c.id]));

  console.log("[seed] platform achievements");
  for (const [i, a] of PLATFORM_ACHIEVEMENTS.entries()) {
    const existing = await db.query.achievements.findFirst({ where: and(isNull(achievements.gameId), eq(achievements.key, a.key)) });
    if (existing) await db.update(achievements).set({ ...a, sortOrder: i }).where(eq(achievements.id, existing.id));
    else await db.insert(achievements).values({ ...a, gameId: null, sortOrder: i });
  }

  for (const g of GAMES) {
    const dir = path.resolve("games", g.slug);
    if (!existsSync(path.join(dir, "index.html"))) {
      console.warn(`[seed] skipping ${g.slug}: games/${g.slug}/index.html not found`);
      continue;
    }
    const listing = {
      title: g.title,
      shortDescription: g.shortDescription,
      description: g.description,
      instructions: g.instructions,
      controls: g.controls,
      categoryId: cats.get(g.categorySlug)!,
      tags: g.tags,
      orientation: g.orientation,
      supportsDesktop: true,
      supportsMobile: g.supportsMobile,
      accentColor: g.accentColor,
      creditName: "ChronoBlink Studio",
    };
    let game = await db.query.games.findFirst({ where: eq(games.slug, g.slug) });
    if (game) {
      await db.update(games).set(listing).where(eq(games.id, game.id));
    } else {
      [game] = await db.insert(games).values({ ...listing, slug: g.slug, status: "draft" }).returning();
    }
    const gameId = game!.id;

    // Build → new version only if files changed.
    const files = await walk(dir);
    const hash = await buildHash(dir, files);
    const live = game!.liveVersionId ? await db.query.gameVersions.findFirst({ where: eq(gameVersions.id, game!.liveVersionId) }) : null;
    if (live?.notes.includes(`build ${hash}`)) {
      console.log(`[seed] ${g.slug}: build ${hash} already live (v${live.version})`);
    } else {
      const [{ next }] = (await db
        .select({ next: sql<number>`coalesce(max(${gameVersions.version}), 0) + 1` })
        .from(gameVersions)
        .where(eq(gameVersions.gameId, gameId))) as [{ next: number }];
      let totalBytes = 0;
      const [v] = await db
        .insert(gameVersions)
        .values({
          gameId,
          version: Number(next),
          status: "processing",
          notes: `First-party build ${hash} (seeded from games/${g.slug})`,
          scanStatus: "skipped_trusted",
          scanDetails: "First-party build from the repository",
          cspExtraOrigins: g.cspExtraOrigins,
        })
        .returning();
      const prefix = publishedPrefix(gameId, v!.id);
      for (const f of files) {
        const buf = await readFile(path.join(dir, f));
        totalBytes += buf.length;
        await storage.put(`${prefix}/${f}`, buf, contentTypeFor(f));
      }
      await storage.put(`${prefix}/${GAME_META_FILE}`, Buffer.from(JSON.stringify({ cspExtraOrigins: g.cspExtraOrigins })), "application/json");
      await db.transaction(async (tx) => {
        if (live) await tx.update(gameVersions).set({ status: "superseded" }).where(eq(gameVersions.id, live.id));
        await tx
          .update(gameVersions)
          .set({
            status: "live",
            storagePrefix: prefix,
            fileCount: files.length,
            totalBytes,
            reviewedAt: new Date(),
            reviewNotes: "First-party build",
            validationReport: { ok: true, errors: [], warnings: [], fileCount: files.length, totalBytes, compressedBytes: totalBytes, files },
          })
          .where(eq(gameVersions.id, v!.id));
        await tx
          .update(games)
          .set({ liveVersionId: v!.id, status: "published", publishedAt: game!.publishedAt ?? new Date() })
          .where(eq(games.id, gameId));
      });
      console.log(`[seed] ${g.slug}: published build ${hash} as v${next} (${files.length} files)`);
    }

    const cover = await uploadMedia(gameId, path.join(dir, "media/cover-landscape-1920x1080.png"), "cover");
    const portrait = await uploadMedia(gameId, path.join(dir, "media/cover-portrait-800x1200.png"), "portrait");
    await db.update(games).set({ coverKey: cover, coverPortraitKey: portrait }).where(eq(games.id, gameId));

    await db
      .insert(leaderboardDefinitions)
      .values({ gameId, key: "highscore", title: "High Score", verification: "provisional", ...g.leaderboard })
      .onConflictDoUpdate({ target: [leaderboardDefinitions.gameId, leaderboardDefinitions.key], set: g.leaderboard });

    for (const [i, a] of g.achievements.entries()) {
      await db
        .insert(achievements)
        .values({ ...a, gameId, sortOrder: i })
        .onConflictDoUpdate({ target: [achievements.gameId, achievements.key], set: { ...a, sortOrder: i } });
    }

    const existingDefs = await db.select().from(challengeDefinitions).where(eq(challengeDefinitions.gameId, gameId));
    for (const c of g.challenges) {
      const match = existingDefs.find((d) => d.type === c.type);
      const values = { gameId, ...c, leaderboardKey: c.type === "score_at_least" ? "highscore" : null };
      if (match) await db.update(challengeDefinitions).set(values).where(eq(challengeDefinitions.id, match.id));
      else await db.insert(challengeDefinitions).values(values);
    }

    const feat = await db.query.featuredPlacements.findFirst({ where: and(eq(featuredPlacements.gameId, gameId), eq(featuredPlacements.slot, "hero")) });
    if (!feat) await db.insert(featuredPlacements).values({ gameId, slot: "hero", headline: g.featured.headline, sortOrder: g.featured.sortOrder });
  }

  console.log("[seed] ad placements (disabled until a provider is configured)");
  for (const key of AD_PLACEMENT_KEYS) {
    await db.insert(adPlacements).values({ key, enabled: false, provider: "none" }).onConflictDoNothing();
  }

  console.log("[seed] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());

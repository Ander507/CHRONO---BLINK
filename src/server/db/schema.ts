/**
 * ChronoBlink Arcade — database schema (PostgreSQL, Drizzle ORM).
 *
 * Auth tables (`user`, `session`, `account`, `verification`) follow the shape
 * Better Auth expects. Everything else is platform domain data. Only tables
 * backing implemented features live here; see docs/ARCHITECTURE.md for the
 * deliberately deferred ones (payments, payouts).
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const ROLES = ["user", "developer", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

// ───────────────────────────── Auth (Better Auth) ─────────────────────────────

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    role: text("role").$type<Role>().notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("user_role_idx").on(t.role)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ───────────────────────────── Profiles & progression ─────────────────────────

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio").notNull().default(""),
  avatarHue: integer("avatar_hue").notNull().default(265),
  avatarGlyph: text("avatar_glyph").notNull().default("bolt"),
  frameId: text("frame_id"),
  themeId: text("theme_id"),
  isPublic: boolean("is_public").notNull().default(true),
  showActivity: boolean("show_activity").notNull().default(true),
  xpTotal: integer("xp_total").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Every XP grant. `sourceKey` makes grants idempotent per user. */
export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    sourceKey: text("source_key").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("xp_user_source_uq").on(t.userId, t.sourceKey), index("xp_user_day_idx").on(t.userId, t.day)],
);

// ───────────────────────────── Catalog ─────────────────────────────

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("gamepad-2"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  studioName: text("studio_name").notNull(),
  website: text("website"),
  bio: text("bio").notNull().default(""),
  status: text("status").$type<"active" | "suspended">().notNull().default("active"),
  /** Trusted developers may upload builds even when no malware scanner is configured. */
  trusted: boolean("trusted").notNull().default(false),
  agreementAcceptedAt: ts("agreement_accepted_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const GAME_STATUSES = ["draft", "in_review", "published", "rejected", "unlisted", "removed"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export type GameControl = { action: string; keys: string };

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    controls: jsonb("controls").$type<GameControl[]>().notNull().default([]),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    developerId: uuid("developer_id").references(() => developers.id, { onDelete: "set null" }),
    /** Display credit, e.g. "ChronoBlink Studio" for first-party titles. */
    creditName: text("credit_name").notNull().default(""),
    status: text("status").$type<GameStatus>().notNull().default("draft"),
    liveVersionId: uuid("live_version_id").references((): AnyPgColumn => gameVersions.id, { onDelete: "set null" }),
    orientation: text("orientation").$type<"landscape" | "portrait" | "any">().notNull().default("any"),
    supportsDesktop: boolean("supports_desktop").notNull().default(true),
    supportsMobile: boolean("supports_mobile").notNull().default(false),
    coverKey: text("cover_key"),
    coverPortraitKey: text("cover_portrait_key"),
    accentColor: text("accent_color").notNull().default("#8b5cf6"),
    statusReason: text("status_reason"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("games_status_published_idx").on(t.status, t.publishedAt),
    index("games_category_idx").on(t.categoryId),
    index("games_developer_idx").on(t.developerId),
    index("games_tags_idx").using("gin", t.tags),
  ],
);

export const VERSION_STATUSES = [
  "pending_upload",
  "processing",
  "invalid",
  "ready",
  "in_review",
  "approved",
  "rejected",
  "live",
  "superseded",
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export type ValidationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fileCount: number;
  totalBytes: number;
  compressedBytes: number;
  files?: string[];
};

export const gameVersions = pgTable(
  "game_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<VersionStatus>().notNull().default("pending_upload"),
    notes: text("notes").notNull().default(""),
    uploadKey: text("upload_key"),
    /** Storage prefix of extracted files (staging until approved, then published). */
    storagePrefix: text("storage_prefix"),
    fileCount: integer("file_count").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    validationReport: jsonb("validation_report").$type<ValidationReport>(),
    scanStatus: text("scan_status")
      .$type<"not_scanned" | "clean" | "infected" | "error" | "skipped_trusted">()
      .notNull()
      .default("not_scanned"),
    scanDetails: text("scan_details"),
    /** Extra origins (admin approved) allowed by this build's CSP, e.g. Google Fonts. */
    cspExtraOrigins: text("csp_extra_origins").array().notNull().default(sql`'{}'::text[]`),
    reviewNotes: text("review_notes"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    submittedAt: ts("submitted_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("game_version_uq").on(t.gameId, t.version), index("game_versions_status_idx").on(t.status)],
);

export const gameAssets = pgTable(
  "game_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"cover" | "cover_portrait">().notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("game_assets_game_idx").on(t.gameId)],
);

export const featuredPlacements = pgTable(
  "featured_placements",
  {
    id: serial("id").primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    slot: text("slot").$type<"hero" | "spotlight">().notNull().default("hero"),
    headline: text("headline"),
    /** Paid placements MUST set sponsored=true; the UI labels them "Sponsored". */
    sponsored: boolean("sponsored").notNull().default(false),
    sponsorName: text("sponsor_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("featured_slot_idx").on(t.slot, t.sortOrder)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] }), index("favorites_game_idx").on(t.gameId)],
);

// ───────────────────────────── Play sessions & analytics ─────────────────────

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => gameVersions.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Random per-browser id, only stored when the visitor consented to analytics. */
    anonId: text("anon_id"),
    /** SHA-256 of the bearer token the player page holds for this session. */
    tokenHash: text("token_hash").notNull(),
    device: text("device").$type<"desktop" | "mobile" | "tablet">().notNull().default("desktop"),
    loadState: text("load_state").$type<"loading" | "loaded" | "failed">().notNull().default("loading"),
    loadMs: integer("load_ms"),
    activeSeconds: integer("active_seconds").notNull().default(0),
    startedAt: ts("started_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    day: date("day", { mode: "string" }).notNull(),
  },
  (t) => [
    index("sessions_game_started_idx").on(t.gameId, t.startedAt),
    index("sessions_user_started_idx").on(t.userId, t.startedAt),
    index("sessions_started_idx").on(t.startedAt),
  ],
);

/** A single attempt inside a session, bracketed by SDK gameplayStart/Stop. Timed by the server. */
export const gameRuns = pgTable(
  "game_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    scoredAt: ts("scored_at"),
  },
  (t) => [index("runs_session_idx").on(t.sessionId), index("runs_user_idx").on(t.userId, t.startedAt)],
);

export const gameplayEvents = pgTable(
  "gameplay_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Client-generated id; duplicates from retries are dropped. */
    eventId: uuid("event_id").notNull().unique(),
    name: text("name").notNull(),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_game_name_idx").on(t.gameId, t.name, t.createdAt), index("events_created_idx").on(t.createdAt)],
);

export const cloudSaves = pgTable(
  "cloud_saves",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    data: jsonb("data").notNull(),
    bytes: integer("bytes").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId, t.key] })],
);

// ───────────────────────────── Achievements ─────────────────────────────

export type AchievementRule =
  | { type: "runs_completed"; count: number }
  | { type: "distinct_games"; count: number }
  | { type: "distinct_days"; count: number }
  | { type: "first_leaderboard_entry" }
  | { type: "challenges_completed"; count: number }
  | { type: "level"; level: number }
  | { type: "score_at_least"; leaderboard: string; score: number }
  /** Reported by the game through the SDK; cannot be verified server-side. */
  | { type: "game_reported"; minRunSeconds: number };

export const achievements = pgTable(
  "achievements",
  {
    id: serial("id").primaryKey(),
    /** null = platform-wide achievement. */
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull().default("trophy"),
    xp: integer("xp").notNull().default(25),
    rule: jsonb("rule").$type<AchievementRule>().notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique("achievement_game_key_uq").on(t.gameId, t.key).nullsNotDistinct()],
);

export const achievementUnlocks = pgTable(
  "achievement_unlocks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    achievementId: integer("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: ts("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

// ───────────────────────────── Leaderboards ─────────────────────────────

export const leaderboardDefinitions = pgTable(
  "leaderboard_definitions",
  {
    id: serial("id").primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    /**
     * provisional = scores come from client-side game code and can't be proven.
     * verified    = a server-side verification adapter checks each score.
     * Prizes must never be attached to provisional boards.
     */
    verification: text("verification").$type<"provisional" | "verified">().notNull().default("provisional"),
    maxScore: integer("max_score").notNull(),
    /** Plausibility bound: score <= baseAllowance + maxScorePerSecond * server-measured run seconds. */
    maxScorePerSecond: integer("max_score_per_second").notNull(),
    baseAllowance: integer("base_allowance").notNull().default(0),
    minRunSeconds: integer("min_run_seconds").notNull().default(3),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("leaderboard_game_key_uq").on(t.gameId, t.key)],
);

export const leaderboardEntries = pgTable(
  "leaderboard_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leaderboardId: integer("leaderboard_id")
      .notNull()
      .references(() => leaderboardDefinitions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    runSeconds: integer("run_seconds").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("leaderboard_entry_run_uq").on(t.leaderboardId, t.runId),
    index("lb_entries_score_idx").on(t.leaderboardId, t.score.desc()),
    index("lb_entries_created_idx").on(t.leaderboardId, t.createdAt),
    index("lb_entries_user_idx").on(t.userId, t.leaderboardId),
  ],
);

// ───────────────────────────── Daily challenges ─────────────────────────────

export type ChallengeType = "score_at_least" | "runs_completed" | "run_seconds_at_least";

export const challengeDefinitions = pgTable("challenge_definitions", {
  id: serial("id").primaryKey(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  type: text("type").$type<ChallengeType>().notNull(),
  /** Leaderboard the score is read from (score_at_least only). */
  leaderboardKey: text("leaderboard_key"),
  /** One target is picked per day, deterministically from the date. */
  targets: integer("targets").array().notNull(),
  /** "{target}" is substituted, e.g. "Score {target} points in CHRONO // BLINK". */
  titleTemplate: text("title_template").notNull(),
  rewardXp: integer("reward_xp").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const dailyChallenges = pgTable("daily_challenges", {
  id: serial("id").primaryKey(),
  day: date("day", { mode: "string" }).notNull().unique(),
  definitionId: integer("definition_id")
    .notNull()
    .references(() => challengeDefinitions.id, { onDelete: "cascade" }),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  type: text("type").$type<ChallengeType>().notNull(),
  leaderboardKey: text("leaderboard_key"),
  target: integer("target").notNull(),
  title: text("title").notNull(),
  rewardXp: integer("reward_xp").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  createdAt: createdAt(),
});

export const challengeProgress = pgTable(
  "challenge_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    completedAt: ts("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.challengeId] })],
);

// ───────────────────────────── Moderation ─────────────────────────────

export const REPORT_REASONS = ["broken", "inappropriate", "malicious", "copyright", "other"] as const;

export const gameReports = pgTable(
  "game_reports",
  {
    id: serial("id").primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason").$type<(typeof REPORT_REASONS)[number]>().notNull(),
    details: text("details").notNull().default(""),
    status: text("status").$type<"open" | "resolved" | "dismissed">().notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_actor_idx").on(t.actorId)],
);

// ───────────────────────────── Monetization ─────────────────────────────

export const AD_PLACEMENT_KEYS = ["home_banner", "catalog_inline", "game_sidebar", "interstitial", "rewarded"] as const;
export type AdPlacementKey = (typeof AD_PLACEMENT_KEYS)[number];

export const adPlacements = pgTable("ad_placements", {
  key: text("key").$type<AdPlacementKey>().primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** "none" until an approved provider account and credentials exist. */
  provider: text("provider").$type<"none" | "adsense" | "h5_games_ads">().notNull().default("none"),
  config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
  frequencyCapSeconds: integer("frequency_cap_seconds").notNull().default(180),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Ad lifecycle reported by provider adapters. Used for frequency caps — never treated as revenue. */
export const adEvents = pgTable(
  "ad_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    placementKey: text("placement_key").notNull(),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    event: text("event").$type<"requested" | "unavailable" | "capped" | "started" | "completed" | "failed">().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ad_events_session_idx").on(t.sessionId, t.createdAt), index("ad_events_created_idx").on(t.createdAt)],
);

// ───────────────────────────── Infrastructure ─────────────────────────────

/** Fixed-window rate limit counters (shared across app instances). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/** Outgoing email log for EMAIL_PROVIDER=console (development mailbox). Never used in production. */
export const devMailbox = pgTable("dev_mailbox", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

// ───────────────────────────── Relations (for db.query) ─────────────────────

export const gamesRelations = relations(games, ({ one, many }) => ({
  category: one(categories, { fields: [games.categoryId], references: [categories.id] }),
  developer: one(developers, { fields: [games.developerId], references: [developers.id] }),
  liveVersion: one(gameVersions, { fields: [games.liveVersionId], references: [gameVersions.id], relationName: "live" }),
  versions: many(gameVersions, { relationName: "versions" }),
}));
export const gameVersionsRelations = relations(gameVersions, ({ one }) => ({
  game: one(games, { fields: [gameVersions.gameId], references: [games.id], relationName: "versions" }),
}));
export const developersRelations = relations(developers, ({ one, many }) => ({
  user: one(user, { fields: [developers.userId], references: [user.id] }),
  games: many(games),
}));
export const categoriesRelations = relations(categories, ({ many }) => ({ games: many(games) }));
export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, { fields: [profiles.userId], references: [user.id] }),
}));

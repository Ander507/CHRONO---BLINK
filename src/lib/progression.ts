/**
 * Platform progression rules. Shared by server (authoritative) and UI (display).
 * XP is only ever granted by the server, from events it measured or verified.
 */

/** XP needed to *reach* level n: 50·(n−1)². Level 10 = 4,050 XP. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) ** 2;
}
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}
export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - floor, needed: next - floor, fraction: (xp - floor) / (next - floor), nextLevelXp: next };
}

export const XP_RULES = {
  /** A run counts as "completed" when the server measured at least this long. */
  completedRunSeconds: 10,
  /** XP for a completed run that posted a valid leaderboard score. */
  scoredRun: 10,
  /** First completed run of the UTC day. */
  dailyFirstPlay: 25,
  /** Max XP per UTC day from repeatable activity (runs + game-reported achievements). */
  dailyActivityCap: 200,
} as const;

/** Reasons that count toward the daily activity cap. */
export const CAPPED_REASONS = ["scored_run", "game_achievement"] as const;

/** Cosmetics unlock through play — none of them affect gameplay. */
export type Cosmetic = { id: string; kind: "frame" | "theme"; name: string; unlock: { level: number }; preview: string };
export const COSMETICS: Cosmetic[] = [
  { id: "frame-none", kind: "frame", name: "Clean", unlock: { level: 1 }, preview: "transparent" },
  { id: "frame-pulse", kind: "frame", name: "Pulse Ring", unlock: { level: 2 }, preview: "#7c5cff" },
  { id: "frame-arc", kind: "frame", name: "Arc Blue", unlock: { level: 4 }, preview: "#38bdf8" },
  { id: "frame-ember", kind: "frame", name: "Ember", unlock: { level: 7 }, preview: "#f97316" },
  { id: "frame-chrono", kind: "frame", name: "Chrono Gold", unlock: { level: 10 }, preview: "#facc15" },
  { id: "theme-void", kind: "theme", name: "Void", unlock: { level: 1 }, preview: "linear-gradient(135deg,#14141c,#0b0b10)" },
  { id: "theme-aurora", kind: "theme", name: "Aurora", unlock: { level: 3 }, preview: "linear-gradient(135deg,#1e1b4b,#0c4a6e)" },
  { id: "theme-nebula", kind: "theme", name: "Nebula", unlock: { level: 6 }, preview: "linear-gradient(135deg,#3b0764,#831843)" },
  { id: "theme-solar", kind: "theme", name: "Solar Flare", unlock: { level: 12 }, preview: "linear-gradient(135deg,#7c2d12,#a16207)" },
];
export function cosmeticUnlocked(c: Cosmetic, level: number) {
  return level >= c.unlock.level;
}

export const AVATAR_GLYPHS = ["bolt", "ghost", "rocket", "crown", "skull", "star", "flame", "orbit"] as const;
export type AvatarGlyph = (typeof AVATAR_GLYPHS)[number];

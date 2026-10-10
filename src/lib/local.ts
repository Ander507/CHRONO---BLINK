"use client";

/**
 * Device-local state for guests and per-device preferences. Everything is
 * wrapped in try/catch because storage can be disabled or full.
 */

const RECENT_KEY = "cb.recent";
const SAVE_PREFIX = "cb.save.";
const MUTE_KEY = "cb.muted";
const ANON_KEY = "cb.anon";

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable or full */
  }
}
function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export type RecentEntry = { slug: string; at: number };

export function getRecent(): RecentEntry[] {
  try {
    const v = JSON.parse(get(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is RecentEntry => typeof e?.slug === "string" && typeof e?.at === "number")
      .slice(0, 12);
  } catch {
    return [];
  }
}
export function pushRecent(slug: string) {
  const list = getRecent().filter((e) => e.slug !== slug);
  list.unshift({ slug, at: Date.now() });
  set(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}
export function clearRecent() {
  remove(RECENT_KEY);
}

export function guestSaveGet(slug: string, key: string): unknown {
  const raw = get(`${SAVE_PREFIX}${slug}.${key}`);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function guestSaveSet(slug: string, key: string, value: unknown) {
  set(`${SAVE_PREFIX}${slug}.${key}`, JSON.stringify(value ?? null));
}
export function guestSaveDelete(slug: string, key: string) {
  remove(`${SAVE_PREFIX}${slug}.${key}`);
}
/** All guest saves on this device, for the optional import into a new account. */
export function listGuestSaves(): { gameSlug: string; key: string; value: unknown }[] {
  const out: { gameSlug: string; key: string; value: unknown }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(SAVE_PREFIX)) continue;
      const rest = k.slice(SAVE_PREFIX.length);
      const dot = rest.indexOf(".");
      if (dot <= 0) continue;
      out.push({ gameSlug: rest.slice(0, dot), key: rest.slice(dot + 1), value: guestSaveGet(rest.slice(0, dot), rest.slice(dot + 1)) });
    }
  } catch {
    /* ignore */
  }
  return out;
}
export function clearGuestSaves() {
  for (const s of listGuestSaves()) guestSaveDelete(s.gameSlug, s.key);
}

export function getMuted(): boolean {
  return get(MUTE_KEY) === "1";
}
export function setMuted(m: boolean) {
  set(MUTE_KEY, m ? "1" : "0");
}

/** Anonymous analytics id — only created after the visitor consents to analytics. */
export function getAnonId(create: boolean): string | null {
  const existing = get(ANON_KEY);
  if (existing) return existing;
  if (!create) return null;
  const id = crypto.randomUUID();
  set(ANON_KEY, id);
  return id;
}
export function clearAnonId() {
  remove(ANON_KEY);
}

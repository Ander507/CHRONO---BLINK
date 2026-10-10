import "server-only";

/**
 * Tiny per-instance TTL cache for hot read paths (leaderboards, catalog
 * shelves). Deliberately simple: each app instance may be up to `ttlMs` stale.
 * Writers call `invalidate(prefix)` so the instance that took the write is fresh.
 */
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 2000;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

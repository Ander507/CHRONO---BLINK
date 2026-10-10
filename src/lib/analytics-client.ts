"use client";

/**
 * Batched first-party analytics for platform pages. Callers must only use
 * this when the visitor consented to analytics (see useConsent). Events carry
 * a client id so retries are de-duplicated server-side.
 */
type Ev = { eventId: string; name: string; gameId?: string | null; props?: Record<string, string | number | boolean | null> };
const queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(keepalive = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, 25);
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: batch }),
    keepalive,
  }).catch(() => {
    /* analytics is best-effort */
  });
  if (queue.length) flush(keepalive);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true));
}

export function trackPlatformEvent(name: string, gameId?: string | null, props?: Ev["props"]) {
  queue.push({ eventId: crypto.randomUUID(), name, gameId: gameId ?? null, props });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(() => flush(), 4000);
}

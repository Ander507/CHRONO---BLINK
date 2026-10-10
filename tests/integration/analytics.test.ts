import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { gameplayEvents } from "@/server/db/schema";
import { applyRetention, gameMetrics, ingestEvents } from "@/server/services/analytics";
import { authorizeSession, createPlaySession, heartbeat, startRun } from "@/server/services/play";
import { rateLimit } from "@/server/rate-limit";
import { makeGame, makeUser, resetDb } from "../support/fixtures";

describe("analytics", () => {
  beforeEach(resetDb);

  it("de-duplicates retried events and sanitises props", async () => {
    const { game } = await makeGame();
    const id = randomUUID();
    const ev = { eventId: id, name: "game_page_view", gameId: game.id, props: { ok: 1, "bad key": 2, long: "x".repeat(500) } };
    expect(await ingestEvents([ev], null)).toBe(1);
    expect(await ingestEvents([ev], null)).toBe(0);
    const [row] = await db.select().from(gameplayEvents);
    expect(row?.props).toEqual({ ok: 1, long: "x".repeat(200) });
  });

  it("computes genuine engagement metrics from sessions and runs", async () => {
    const { game } = await makeGame();
    const u = await makeUser();
    for (const [user, anonId] of [
      [u, null],
      [null, randomUUID()],
      [null, null],
    ] as const) {
      const s = await createPlaySession({ gameSlug: game.slug, user, anonId, device: user ? "desktop" : "mobile" });
      const row = await authorizeSession(s.sessionId, s.token, user);
      await heartbeat(row, { activeSeconds: 0, loadState: "loaded", loadMs: 100 });
      if (user) await startRun(row);
    }
    const m = await gameMetrics([game.id], 30);
    expect(m.sessions).toBe(3);
    expect(m.loadedSessions).toBe(3);
    expect(m.identifiedPlayers).toBe(2); // the consent-less guest isn't identifiable
    expect(m.signedInPlayers).toBe(1);
    expect(m.startConversion).toBeCloseTo(1 / 3);
    expect(m.abandonedBeforeStart).toBe(2);
    expect(m.d1Retention).toBeNull(); // not enough data — never guessed
    expect(m.devices.find((d) => d.device === "mobile")?.sessions).toBe(2);
  });

  it("applies retention to raw events and anonymous ids", async () => {
    const { game } = await makeGame();
    await ingestEvents([{ eventId: randomUUID(), name: "game_page_view", gameId: game.id }], null);
    const s = await createPlaySession({ gameSlug: game.slug, user: null, anonId: randomUUID(), device: "desktop" });
    await db.execute(sql`update gameplay_events set created_at = now() - interval '400 days'`);
    await db.execute(sql`update game_sessions set started_at = now() - interval '400 days' where id = ${s.sessionId}`);
    const r = await applyRetention();
    expect(r.eventsDeleted).toBe(1);
    expect(r.sessionsAnonymised).toBe(1);
  });
});

describe("rate limiter", () => {
  beforeEach(resetDb);
  it("counts within a fixed window", async () => {
    const key = `t:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit(key, 3, 60)).ok);
    expect(results).toEqual([true, true, true, false]);
  });
});

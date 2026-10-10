import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { gameplayEvents } from "@/server/db/schema";
import { env } from "@/server/env";

/** Platform-emitted event names. SDK custom events are stored as `sdk:<name>`. */
export const PLATFORM_EVENTS = [
  "game_page_view",
  "game_load_start",
  "game_load_success",
  "game_load_error",
  "gameplay_start",
  "gameplay_end",
  "session_abandon",
  "favorite_add",
  "favorite_remove",
  "challenge_view",
  "sdk_error",
] as const;

export type IncomingEvent = {
  eventId: string;
  name: string;
  gameId?: string | null;
  sessionId?: string | null;
  props?: Record<string, string | number | boolean | null>;
};

/** Batch insert; duplicate event ids (client retries) are ignored. */
export async function ingestEvents(events: IncomingEvent[], userId: string | null) {
  if (events.length === 0) return 0;
  const rows = events.slice(0, 50).map((e) => ({
    eventId: e.eventId,
    name: e.name.slice(0, 64),
    gameId: e.gameId ?? null,
    sessionId: e.sessionId ?? null,
    userId,
    props: sanitizeProps(e.props),
  }));
  const res = await db.insert(gameplayEvents).values(rows).onConflictDoNothing().returning({ id: gameplayEvents.id });
  return res.length;
}

function sanitizeProps(p?: Record<string, unknown>) {
  const out: Record<string, string | number | boolean | null> = {};
  if (!p) return out;
  for (const [k, v] of Object.entries(p).slice(0, 16)) {
    if (!/^[a-zA-Z0-9_]{1,32}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

export type GameMetrics = {
  sessions: number;
  loadedSessions: number;
  loadSuccessRate: number | null;
  identifiedPlayers: number;
  signedInPlayers: number;
  avgActiveSeconds: number | null;
  totalActiveSeconds: number;
  startConversion: number | null;
  returningPlayers: number;
  devices: { device: string; sessions: number }[];
  daily: { day: string; sessions: number; activeSeconds: number }[];
  d1Retention: { rate: number; cohort: number } | null;
  abandonedBeforeStart: number;
};

/**
 * Genuine engagement metrics computed from recorded sessions and runs.
 * "Identified players" = signed-in users + guests with analytics consent
 * (an anonymous id); guests without consent are counted as sessions only.
 * Retention is only reported once the cohort has ≥ 20 identified players.
 */
export async function gameMetrics(gameIds: string[] | null, days = 30): Promise<GameMetrics> {
  const scope = gameIds ? sql`and s.game_id = any(${sql.param(gameIds)}::uuid[])` : sql``;
  const since = sql`now() - make_interval(days => ${days})`;
  const [base] = await db.execute<{
    sessions: number;
    loaded: number;
    identified: number;
    signed_in: number;
    avg_active: number | null;
    total_active: number | null;
    with_run: number;
    abandoned: number;
  }>(sql`
    select count(*)::int as sessions,
      count(*) filter (where s.load_state = 'loaded')::int as loaded,
      count(distinct coalesce(s.user_id, s.anon_id))::int as identified,
      count(distinct s.user_id)::int as signed_in,
      avg(s.active_seconds) filter (where s.load_state = 'loaded')::float as avg_active,
      sum(s.active_seconds)::bigint as total_active,
      count(*) filter (where exists (select 1 from game_runs r where r.session_id = s.id))::int as with_run,
      count(*) filter (where s.load_state = 'loaded' and not exists (select 1 from game_runs r where r.session_id = s.id))::int as abandoned
    from game_sessions s where s.started_at > ${since} ${scope}
  `);
  const [ret] = await db.execute<{ returning: number }>(sql`
    select count(*)::int as returning from (
      select coalesce(s.user_id, s.anon_id) as pid from game_sessions s
      where s.started_at > ${since} and coalesce(s.user_id, s.anon_id) is not null ${scope}
      group by 1 having count(distinct s.day) >= 2
    ) t
  `);
  const devices = await db.execute<{ device: string; sessions: number }>(sql`
    select s.device, count(*)::int as sessions from game_sessions s
    where s.started_at > ${since} ${scope} group by s.device order by 2 desc
  `);
  const daily = await db.execute<{ day: string; sessions: number; active: number }>(sql`
    select s.day::text as day, count(*)::int as sessions, coalesce(sum(s.active_seconds), 0)::int as active
    from game_sessions s where s.started_at > ${since} ${scope} group by s.day order by s.day
  `);
  const [d1] = await db.execute<{ cohort: number; retained: number }>(sql`
    with firsts as (
      select coalesce(s.user_id, s.anon_id) as pid, min(s.day) as first_day from game_sessions s
      where coalesce(s.user_id, s.anon_id) is not null ${scope} group by 1
    )
    select count(*)::int as cohort,
      count(*) filter (where exists (
        select 1 from game_sessions s2 where coalesce(s2.user_id, s2.anon_id) = f.pid and s2.day = f.first_day + 1
        ${gameIds ? sql`and s2.game_id = any(${sql.param(gameIds)}::uuid[])` : sql``}
      ))::int as retained
    from firsts f where f.first_day < (now() at time zone 'utc')::date - 1 and f.first_day > (now() at time zone 'utc')::date - ${days}::int
  `);
  const sessions = Number(base?.sessions ?? 0);
  const loaded = Number(base?.loaded ?? 0);
  const cohort = Number(d1?.cohort ?? 0);
  return {
    sessions,
    loadedSessions: loaded,
    loadSuccessRate: sessions ? loaded / sessions : null,
    identifiedPlayers: Number(base?.identified ?? 0),
    signedInPlayers: Number(base?.signed_in ?? 0),
    avgActiveSeconds: base?.avg_active == null ? null : Number(base.avg_active),
    totalActiveSeconds: Number(base?.total_active ?? 0),
    startConversion: loaded ? Number(base?.with_run ?? 0) / loaded : null,
    returningPlayers: Number(ret?.returning ?? 0),
    devices: devices.map((d) => ({ device: d.device, sessions: Number(d.sessions) })),
    daily: daily.map((d) => ({ day: d.day, sessions: Number(d.sessions), activeSeconds: Number(d.active) })),
    d1Retention: cohort >= 20 ? { rate: Number(d1?.retained ?? 0) / cohort, cohort } : null,
    abandonedBeforeStart: Number(base?.abandoned ?? 0),
  };
}

/**
 * Retention: raw events older than ANALYTICS_RETENTION_DAYS are deleted and
 * anonymous ids on old sessions are cleared. Aggregate session rows remain
 * (they hold no personal data once anon_id is null).
 */
export async function applyRetention() {
  const days = env.ANALYTICS_RETENTION_DAYS;
  const ev = await db.execute(sql`delete from gameplay_events where created_at < now() - make_interval(days => ${days})`);
  const anon = await db.execute(
    sql`update game_sessions set anon_id = null where anon_id is not null and started_at < now() - make_interval(days => ${days})`,
  );
  const ads = await db.execute(sql`delete from ad_events where created_at < now() - make_interval(days => ${days})`);
  return { eventsDeleted: ev.count, sessionsAnonymised: anon.count, adEventsDeleted: ads.count };
}

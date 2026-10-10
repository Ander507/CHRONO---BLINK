import "server-only";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  auditLogs,
  developers,
  gameReports,
  gameVersions,
  games,
  user,
} from "@/server/db/schema";
import { env, integrations } from "@/server/env";
import { storage } from "@/server/services/storage";

export async function platformOverview() {
  const [[g], [u], [s7], [rep], [sub]] = await Promise.all([
    db.execute<{ total: number; published: number; in_review: number }>(sql`
      select count(*)::int as total,
        count(*) filter (where status = 'published')::int as published,
        count(*) filter (where status = 'in_review')::int as in_review
      from games where status <> 'removed'`),
    db.execute<{ total: number; new7: number; verified: number }>(sql`
      select count(*)::int as total,
        count(*) filter (where created_at > now() - interval '7 days')::int as new7,
        count(*) filter (where email_verified)::int as verified
      from "user"`),
    db.execute<{ sessions: number; players: number; signed_in: number; active_seconds: number; runs: number }>(sql`
      select count(*)::int as sessions,
        count(distinct coalesce(user_id, anon_id))::int as players,
        count(distinct user_id)::int as signed_in,
        coalesce(sum(active_seconds), 0)::bigint as active_seconds,
        (select count(*) from game_runs where started_at > now() - interval '7 days')::int as runs
      from game_sessions where started_at > now() - interval '7 days'`),
    db.execute<{ open: number }>(sql`select count(*)::int as open from game_reports where status = 'open'`),
    db.execute<{ pending: number }>(sql`select count(*)::int as pending from game_versions where status = 'in_review'`),
  ]);
  const engagement = await db.execute<{ id: string; slug: string; title: string; sessions: number; loaded: number; avg_active: number | null; runs: number; scores: number }>(sql`
    select g.id, g.slug, g.title,
      count(s.id)::int as sessions,
      count(s.id) filter (where s.load_state = 'loaded')::int as loaded,
      avg(s.active_seconds) filter (where s.load_state = 'loaded')::float as avg_active,
      (select count(*) from game_runs r where r.game_id = g.id and r.started_at > now() - interval '7 days')::int as runs,
      (select count(*) from leaderboard_entries e join leaderboard_definitions d on d.id = e.leaderboard_id where d.game_id = g.id and e.created_at > now() - interval '7 days')::int as scores
    from games g left join game_sessions s on s.game_id = g.id and s.started_at > now() - interval '7 days'
    where g.status in ('published', 'unlisted')
    group by g.id order by sessions desc limit 20`);
  return {
    games: g!,
    users: u!,
    week: { ...s7!, active_seconds: Number(s7!.active_seconds) },
    openReports: rep!.open,
    pendingSubmissions: sub!.pending,
    engagement: engagement.map((e) => ({ ...e, avg_active: e.avg_active == null ? null : Number(e.avg_active) })),
  };
}

export async function reviewQueue() {
  return db
    .select({
      version: gameVersions,
      game: { id: games.id, title: games.title, slug: games.slug, status: games.status, coverKey: games.coverKey, description: games.shortDescription },
      studio: developers.studioName,
      trusted: developers.trusted,
    })
    .from(gameVersions)
    .innerJoin(games, eq(games.id, gameVersions.gameId))
    .leftJoin(developers, eq(developers.id, games.developerId))
    .where(eq(gameVersions.status, "in_review"))
    .orderBy(gameVersions.submittedAt);
}

export async function recentReviews(limit = 20) {
  return db
    .select({ version: gameVersions, title: games.title, slug: games.slug })
    .from(gameVersions)
    .innerJoin(games, eq(games.id, gameVersions.gameId))
    .where(sql`${gameVersions.reviewedAt} is not null and ${gameVersions.reviewNotes} <> 'First-party build'`)
    .orderBy(desc(gameVersions.reviewedAt))
    .limit(limit);
}

export async function searchUsers(q: string, limit = 50) {
  const term = q.trim();
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.displayUsername,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(term ? or(ilike(user.email, like), ilike(user.username, like), ilike(user.name, like)) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit);
}

export async function listDevelopers() {
  return db
    .select({
      dev: developers,
      email: user.email,
      username: user.displayUsername,
      games: sql<number>`(select count(*) from games g where g.developer_id = "developers"."id")::int`,
    })
    .from(developers)
    .innerJoin(user, eq(user.id, developers.userId))
    .orderBy(desc(developers.createdAt));
}

export async function listReports(status: "open" | "resolved" | "dismissed" | "all" = "open") {
  return db
    .select({ report: gameReports, title: games.title, slug: games.slug, reporter: user.displayUsername })
    .from(gameReports)
    .innerJoin(games, eq(games.id, gameReports.gameId))
    .leftJoin(user, eq(user.id, gameReports.userId))
    .where(status === "all" ? undefined : eq(gameReports.status, status))
    .orderBy(desc(gameReports.createdAt))
    .limit(200);
}

export async function listAuditLogs(opts: { action?: string; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.action ? ilike(auditLogs.action, `${opts.action.replace(/[%_\\]/g, "")}%`) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({ log: auditLogs, actor: user.displayUsername, actorEmail: user.email })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.id))
      .limit(50)
      .offset((page - 1) * 50),
    db.select({ n: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total: Number(total?.n ?? 0), page };
}

export async function allGamesForAdmin() {
  return db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      status: games.status,
      creditName: games.creditName,
      coverKey: games.coverKey,
      liveVersionId: games.liveVersionId,
      publishedAt: games.publishedAt,
      studio: developers.studioName,
    })
    .from(games)
    .leftJoin(developers, eq(developers.id, games.developerId))
    .orderBy(desc(games.updatedAt));
}

export type HealthCheck = { name: string; ok: boolean; detail: string };

export async function systemHealth(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const t0 = performance.now();
  try {
    const [r] = await db.execute<{ v: string; migrations: number }>(
      sql`select version() as v, (select count(*) from drizzle.__drizzle_migrations)::int as migrations`,
    );
    checks.push({ name: "PostgreSQL", ok: true, detail: `${Math.round(performance.now() - t0)} ms · ${r?.v.split(",")[0]} · ${r?.migrations} migrations applied` });
  } catch (e) {
    checks.push({ name: "PostgreSQL", ok: false, detail: (e as Error).message });
  }
  try {
    const key = `media/_health/${Date.now()}.txt`;
    await storage.put(key, Buffer.from("ok"), "text/plain");
    const ok = (await storage.getBuffer(key, 16))?.toString() === "ok";
    await storage.delete(key);
    checks.push({ name: `Object storage (${storage.kind})`, ok, detail: ok ? "write/read/delete probe passed" : "probe mismatch" });
  } catch (e) {
    checks.push({ name: `Object storage (${storage.kind})`, ok: false, detail: (e as Error).message });
  }
  try {
    const res = await fetch(`${env.GAME_ORIGIN}/healthz`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    checks.push({ name: "Game origin", ok: res.ok, detail: `${env.GAME_ORIGIN} → HTTP ${res.status}` });
  } catch (e) {
    checks.push({ name: "Game origin", ok: false, detail: `${env.GAME_ORIGIN} unreachable: ${(e as Error).message}` });
  }
  checks.push({
    name: "Origin isolation",
    ok: new URL(env.APP_URL).host !== new URL(env.GAME_ORIGIN).host,
    detail: `app ${new URL(env.APP_URL).host} · games ${new URL(env.GAME_ORIGIN).host}`,
  });
  checks.push({
    name: "Email delivery",
    ok: integrations.email,
    detail: env.EMAIL_PROVIDER === "console" ? "console (development mailbox) — no real delivery" : integrations.email ? "Resend configured" : "Resend key missing",
  });
  checks.push({ name: "Cloudflare Turnstile", ok: integrations.turnstile, detail: integrations.turnstile ? "configured" : "not configured (skipped outside production)" });
  checks.push({ name: "Google sign-in", ok: integrations.googleAuth, detail: integrations.googleAuth ? "configured" : "not configured (button hidden)" });
  checks.push({
    name: "Malware scanner",
    ok: integrations.malwareScanner,
    detail: integrations.malwareScanner ? `clamd at ${env.CLAMAV_HOST}:${env.CLAMAV_PORT}` : "none — uploads restricted to verified studios and staff",
  });
  checks.push({ name: "Analytics retention", ok: true, detail: `${env.ANALYTICS_RETENTION_DAYS} days for raw events and anonymous ids` });
  return checks;
}

export async function versionWithGame(versionId: string) {
  const [row] = await db
    .select({ version: gameVersions, game: games })
    .from(gameVersions)
    .innerJoin(games, eq(games.id, gameVersions.gameId))
    .where(and(eq(gameVersions.id, versionId)));
  return row ?? null;
}

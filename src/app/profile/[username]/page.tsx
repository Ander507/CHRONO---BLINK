import { CheckCircle2, Lock, Settings, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, NamedIcon } from "@/components/brand";
import { ContinueRow } from "@/components/home/guest-continue";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Progress, Stat } from "@/components/ui/misc";
import { COSMETICS, levelProgress } from "@/lib/progression";
import { cn, formatNumber } from "@/lib/utils";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { recentlyPlayed } from "@/server/services/catalog";
import { getUserStats } from "@/server/services/progression";
import { achievementsForUser, getPublicProfile, personalBests } from "@/server/services/profiles";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getPublicProfile((await params).username);
  if (!p) return { title: "Player not found", robots: { index: false } };
  const name = p.user.displayUsername ?? p.user.username;
  return {
    title: `${name} — player profile`,
    description: `${name} on ChronoBlink Arcade: level ${p.profile?.level ?? 1}, achievements and personal bests.`,
    robots: p.profile?.isPublic === false ? { index: false } : undefined,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const row = await getPublicProfile(username);
  if (!row) notFound();
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === row.user.id;
  const profile = row.profile;
  const handle = row.user.displayUsername ?? row.user.username ?? "player";
  const theme = COSMETICS.find((c) => c.id === profile?.themeId && c.kind === "theme");

  if (profile && !profile.isPublic && !isOwner) {
    return (
      <EmptyState icon={<Lock />} title={`@${handle} has a private profile`} className="mx-auto mt-10 max-w-lg">
        Only they can see their stats and achievements.
      </EmptyState>
    );
  }

  const xp = profile?.xpTotal ?? 0;
  const lp = levelProgress(xp);
  const showActivity = isOwner || (profile?.showActivity ?? true);
  const [stats, ach, bests, recent] = await Promise.all([
    getUserStats(db, row.user.id),
    achievementsForUser(isOwner ? row.user.id : row.user.id),
    showActivity ? personalBests(row.user.id) : Promise.resolve([]),
    showActivity ? recentlyPlayed(row.user.id, 6) : Promise.resolve([]),
  ]);
  const unlocked = ach.filter((a) => a.unlockedAt);
  const visibleAch = isOwner ? ach : unlocked;

  return (
    <div className="space-y-10">
      <header
        className="relative overflow-hidden rounded-3xl border border-line p-6 sm:p-8"
        style={{ background: theme?.preview ?? "linear-gradient(135deg,#14141c,#0b0b10)" }}
      >
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <Avatar hue={profile?.avatarHue ?? 265} glyph={profile?.avatarGlyph ?? "bolt"} frameId={profile?.frameId} size={96} label={`${handle}'s avatar`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-extrabold text-fg">{row.user.name}</h1>
              {row.user.role === "admin" || row.user.role === "moderator" ? <Badge tone="primary">Staff</Badge> : null}
              {row.user.role === "developer" ? <Badge tone="electric">Developer</Badge> : null}
              {profile && !profile.isPublic ? (
                <Badge>
                  <Lock /> Private
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-fg-muted">
              @{handle} · joined {row.user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            {profile?.bio ? <p className="mt-3 max-w-xl text-sm text-fg">{profile.bio}</p> : null}
            <div className="mt-4 max-w-md">
              <div className="mb-1.5 flex justify-between text-xs font-semibold">
                <span className="text-fg">Level {lp.level}</span>
                <span className="tabular text-fg-muted">
                  {formatNumber(lp.current)} / {formatNumber(lp.needed)} XP to level {lp.level + 1}
                </span>
              </div>
              <Progress value={lp.fraction} label="Level progress" />
            </div>
          </div>
          {isOwner ? (
            <Button asChild variant="secondary" className="self-start">
              <Link href="/settings">
                <Settings /> Edit profile
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total XP" value={formatNumber(xp)} />
        <Stat label="Achievements" value={`${unlocked.length}/${ach.length}`} />
        <Stat label="Games played" value={stats.distinctGames} />
        <Stat label="Runs finished" value={formatNumber(stats.runsCompleted)} />
        <Stat label="Days played" value={stats.distinctDays} />
      </div>

      {showActivity && recent.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-fg">Recently played</h2>
          <ContinueRow items={recent.map((g) => ({ game: g, at: null }))} />
        </section>
      ) : null}

      {showActivity && bests.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-fg">Personal bests</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bests.map((b) => (
              <Link key={b.slug} href={`/leaderboards/${b.slug}`} className="surface flex items-center gap-3 p-3 transition hover:border-line-strong">
                <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-overlay">
                  {b.cover ? <Image src={b.cover} alt="" fill sizes="80px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{b.title}</span>
                  <span className="text-xs text-fg-subtle">
                    {b.runs} scored {b.runs === 1 ? "run" : "runs"}
                  </span>
                </span>
                <span className="tabular flex items-center gap-1 font-display font-bold text-fg">
                  <Trophy className="size-3.5 text-warning" />
                  {formatNumber(b.best)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 font-display text-xl font-bold text-fg">Achievements</h2>
        {visibleAch.length === 0 ? (
          <p className="text-sm text-fg-muted">No achievements unlocked yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAch.map((a) => (
              <div key={a.id} className={cn("surface flex gap-3 p-4", !a.unlockedAt && "opacity-70")}>
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
                    a.unlockedAt ? "bg-primary-soft text-primary-hover" : "bg-raised text-fg-subtle",
                  )}
                >
                  {a.unlockedAt ? <NamedIcon name={a.icon} /> : <Lock />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    {a.title}
                    {a.unlockedAt ? <CheckCircle2 className="size-3.5 text-success" /> : null}
                  </p>
                  <p className="text-xs text-fg-muted">{a.description}</p>
                  <p className="mt-1 text-[11px] text-fg-subtle">
                    {a.gameTitle ?? "Platform"} · +{a.xp} XP{!a.verified ? " · game-reported" : ""}
                    {a.unlockedAt ? ` · ${a.unlockedAt.toLocaleDateString("en-US")}` : ""}
                  </p>
                  {isOwner && a.progress && !a.unlockedAt && a.progress[1] > 1 ? (
                    <div className="mt-2">
                      <Progress value={a.progress[0] / a.progress[1]} className="h-1.5" label={`${a.title} progress`} />
                      <p className="tabular mt-1 text-[11px] text-fg-subtle">
                        {formatNumber(Math.min(a.progress[0], a.progress[1]))} / {formatNumber(a.progress[1])}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

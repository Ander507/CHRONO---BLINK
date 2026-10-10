import { CalendarCheck, CheckCircle2, Clock, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils";
import { mediaUrl } from "@/server/services/storage";
import type { getTodayChallenge } from "@/server/services/challenges";

type Challenge = NonNullable<Awaited<ReturnType<typeof getTodayChallenge>>>;

export function describeTarget(c: { type: string; target: number }) {
  if (c.type === "score_at_least") return `${formatNumber(c.target)} pts`;
  if (c.type === "run_seconds_at_least") return `${c.target}s`;
  return `${c.target} runs`;
}

function hoursUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 3_600_000));
}

export function ChallengeCard({
  challenge,
  progress,
  signedIn,
}: {
  challenge: Challenge;
  progress: { progress: number; completedAt: Date | null } | null;
  signedIn: boolean;
}) {
  const done = Boolean(progress?.completedAt);
  const value = Math.min(progress?.progress ?? 0, challenge.target);
  const hoursLeft = hoursUntil(challenge.endsAt);
  const cover = mediaUrl(challenge.game.coverKey);
  return (
    <section aria-labelledby="daily-heading" className="relative overflow-hidden rounded-3xl border border-line bg-surface">
      {cover ? (
        <Image src={cover} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover opacity-25" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/40" />
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="electric">
              <CalendarCheck /> Daily challenge
            </Badge>
            <Badge>
              <Clock /> {hoursLeft}h left · resets 00:00 UTC
            </Badge>
          </div>
          <h2 id="daily-heading" className="mt-3 font-display text-2xl font-extrabold text-fg sm:text-3xl">
            {challenge.title}
          </h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            Reward: <span className="font-semibold text-fg">+{challenge.rewardXp} XP</span>. Progress is measured by the server from your runs
            {challenge.type === "score_at_least" ? " and submitted scores" : ""}.
          </p>
          {signedIn ? (
            <div className="mt-4 max-w-sm">
              <div className="mb-1.5 flex justify-between text-xs font-semibold">
                <span className="text-fg-muted">{done ? "Completed" : "Your progress"}</span>
                <span className="tabular text-fg">
                  {challenge.type === "score_at_least" ? formatNumber(value) : value} / {describeTarget(challenge)}
                </span>
              </div>
              <Progress value={value / challenge.target} label="Daily challenge progress" />
            </div>
          ) : (
            <p className="mt-4 text-sm text-fg-subtle">
              <Link href="/login?next=/challenges" className="font-semibold text-electric hover:underline">
                Sign in
              </Link>{" "}
              to track progress and earn the reward.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {done ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2.5 text-sm font-bold text-success">
              <CheckCircle2 className="size-4" /> Done for today
            </span>
          ) : (
            <Button asChild size="lg">
              <Link href={`/play/${challenge.game.slug}`}>
                <Play className="fill-current" /> Play {challenge.game.title}
              </Link>
            </Button>
          )}
          <Link href="/challenges" className="text-xs font-semibold text-fg-subtle hover:text-fg">
            Challenge history →
          </Link>
        </div>
      </div>
    </section>
  );
}

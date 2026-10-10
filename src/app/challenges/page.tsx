import { CalendarCheck, CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChallengeCard, describeTarget } from "@/components/home/challenge-card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/session";
import { getChallengeHistory, getChallengeProgress, getTodayChallenge } from "@/server/services/challenges";

export const metadata: Metadata = {
  title: "Daily challenge",
  description: "A new challenge every day at 00:00 UTC. Complete it to earn bonus XP on ChronoBlink Arcade.",
  alternates: { canonical: "/challenges" },
};

export default async function ChallengesPage() {
  const user = await getCurrentUser();
  const challenge = await getTodayChallenge();
  const [progress, history] = await Promise.all([
    user && challenge ? getChallengeProgress(user.id, challenge.id) : null,
    user ? getChallengeHistory(user.id, 30) : Promise.resolve([]),
  ]);
  const completed = history.filter((h) => h.completedAt).length;
  let streak = 0;
  for (const h of history) {
    if (h.completedAt) streak++;
    else break;
  }
  if (progress?.completedAt) streak++;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Daily challenge"
        description="One challenge a day, picked from the games installed on ChronoBlink. Each runs 00:00–24:00 UTC and its reward can be earned once."
      />
      {challenge ? (
        <ChallengeCard challenge={challenge} progress={progress ?? null} signedIn={Boolean(user)} />
      ) : (
        <EmptyState icon={<CalendarCheck />} title="No challenge today">
          Challenges are generated only from published games with challenge definitions.
        </EmptyState>
      )}
      {user ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Current streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} />
            <Stat label="Completed (last 30)" value={completed + (progress?.completedAt ? 1 : 0)} />
            <Stat label="Reward today" value={challenge ? `+${challenge.rewardXp} XP` : "—"} />
          </div>
          <section>
            <h2 className="mb-4 font-display text-xl font-bold text-fg">History</h2>
            {history.length === 0 ? (
              <p className="text-sm text-fg-muted">Past challenges will appear here.</p>
            ) : (
              <ul className="surface divide-y divide-line">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-4 px-4 py-3">
                    {h.completedAt ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Completed" /> : <Circle className="size-5 shrink-0 text-fg-subtle" aria-label="Not completed" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{h.title}</p>
                      <p className="text-xs text-fg-subtle">
                        {h.day} ·{" "}
                        <Link href={`/play/${h.gameSlug}`} className="hover:text-fg">
                          {h.gameTitle}
                        </Link>
                      </p>
                    </div>
                    <span className="tabular text-right text-xs text-fg-muted">
                      {h.progress ?? 0} / {describeTarget(h)}
                      <span className="block font-semibold text-fg-subtle">+{h.rewardXp} XP</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

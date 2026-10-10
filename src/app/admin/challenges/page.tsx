import { desc, eq, sql } from "drizzle-orm";
import { toggleChallengeDefinitionAction } from "@/app/actions/admin";
import { ChallengeDefinitionForm } from "@/components/admin/admin-controls";
import { ActionButton, Table } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { challengeDefinitions, dailyChallenges, games } from "@/server/db/schema";
import { requireRole } from "@/server/session";
import { getTodayChallenge } from "@/server/services/challenges";

export const metadata = { title: "Challenges" };

export default async function AdminChallengesPage() {
  await requireRole("admin");
  const [defs, recent, today, gameList] = await Promise.all([
    db.select({ d: challengeDefinitions, title: games.title, status: games.status }).from(challengeDefinitions).innerJoin(games, eq(games.id, challengeDefinitions.gameId)),
    db
      .select({
        c: dailyChallenges,
        title: games.title,
        completions: sql<number>`(select count(*) from challenge_progress p where p.challenge_id = "daily_challenges"."id" and p.completed_at is not null)::int`,
      })
      .from(dailyChallenges)
      .innerJoin(games, eq(games.id, dailyChallenges.gameId))
      .orderBy(desc(dailyChallenges.day))
      .limit(14),
    getTodayChallenge(),
    db.select({ id: games.id, title: games.title }).from(games).where(eq(games.status, "published")),
  ]);
  return (
    <div className="space-y-10">
      <section className="surface p-5">
        <h2 className="font-display text-lg font-bold text-fg">Today</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {today ? `${today.title} · +${today.rewardXp} XP · ${today.startsAt.toISOString()} → ${today.endsAt.toISOString()}` : "No eligible definitions — add one below."}
        </p>
        <p className="mt-2 text-xs text-fg-subtle">
          Each UTC day picks one active definition whose game is published, deterministically from the date. The rollover job (POST /api/cron/daily) also creates it ahead of time.
        </p>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-fg">Definitions</h2>
        <Table head={["Game", "Type", "Targets", "Template", "XP", ""]}>
          {defs.map(({ d, title, status }) => (
            <tr key={d.id}>
              <td className="px-4 py-3 font-semibold text-fg">
                {title} {status !== "published" ? <Badge>not published</Badge> : null}
              </td>
              <td className="px-4 py-3 text-fg-muted">{d.type.replace(/_/g, " ")}</td>
              <td className="tabular px-4 py-3">{d.targets.join(", ")}</td>
              <td className="px-4 py-3 text-fg-muted">{d.titleTemplate}</td>
              <td className="tabular px-4 py-3">{d.rewardXp}</td>
              <td className="px-4 py-3 text-right">
                <ActionButton size="sm" variant={d.active ? "secondary" : "primary"} action={toggleChallengeDefinitionAction.bind(null, d.id, !d.active)} success="Updated">
                  {d.active ? "Disable" : "Enable"}
                </ActionButton>
              </td>
            </tr>
          ))}
        </Table>
        <div className="surface mt-4 p-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">New definition</h3>
          <ChallengeDefinitionForm games={gameList} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-fg">Recent days</h2>
        <ul className="surface divide-y divide-line text-sm">
          {recent.map(({ c, title, completions }) => (
            <li key={c.id} className="flex flex-wrap gap-3 px-4 py-2.5">
              <span className="tabular text-fg-subtle">{c.day}</span>
              <span className="text-fg">{c.title}</span>
              <span className="text-fg-muted">{title}</span>
              <span className="ml-auto text-fg-subtle">{completions} completed</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import { eq, sql } from "drizzle-orm";
import { AchievementForm, AchievementRow } from "@/components/admin/admin-controls";
import { Table } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { achievements, games } from "@/server/db/schema";
import { requireRole } from "@/server/session";

export const metadata = { title: "Achievements" };

export default async function AdminAchievementsPage() {
  await requireRole("admin");
  const [rows, gameList] = await Promise.all([
    db
      .select({
        a: achievements,
        game: games.title,
        unlocks: sql<number>`(select count(*) from achievement_unlocks u where u.achievement_id = "achievements"."id")::int`,
      })
      .from(achievements)
      .leftJoin(games, eq(games.id, achievements.gameId))
      .orderBy(sql`${achievements.gameId} nulls first`, achievements.sortOrder),
    db.select({ id: games.id, title: games.title }).from(games).where(eq(games.status, "published")),
  ]);
  return (
    <div className="space-y-8">
      <Table head={["Achievement", "Scope", "Rule", "Unlocks", "XP / active"]}>
        {rows.map(({ a, game, unlocks }) => (
          <tr key={a.id} className={a.active ? undefined : "opacity-60"}>
            <td className="px-4 py-3">
              <span className="font-semibold text-fg">{a.title}</span>
              <span className="block text-xs text-fg-subtle">
                {a.key} · {a.description}
              </span>
            </td>
            <td className="px-4 py-3 text-fg-muted">{game ?? "Platform"}</td>
            <td className="px-4 py-3">
              <Badge tone={a.rule.type === "game_reported" ? "warning" : "success"}>{a.rule.type.replace(/_/g, " ")}</Badge>
            </td>
            <td className="tabular px-4 py-3">{unlocks}</td>
            <td className="px-4 py-3">
              <AchievementRow id={a.id} active={a.active} xp={a.xp} />
            </td>
          </tr>
        ))}
      </Table>
      <section className="surface p-5">
        <h2 className="mb-3 font-display text-lg font-bold text-fg">New achievement</h2>
        <AchievementForm games={gameList} />
      </section>
    </div>
  );
}

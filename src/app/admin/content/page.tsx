import { asc, eq } from "drizzle-orm";
import { deleteCategoryAction, removeFeaturedAction } from "@/app/actions/admin";
import { CategoryForm } from "@/components/admin/admin-controls";
import { ActionButton } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { categories, featuredPlacements, games } from "@/server/db/schema";
import { requireRole } from "@/server/session";

export const metadata = { title: "Featured & categories" };

export default async function ContentPage() {
  await requireRole("admin");
  const [featured, cats] = await Promise.all([
    db
      .select({ f: featuredPlacements, title: games.title })
      .from(featuredPlacements)
      .innerJoin(games, eq(games.id, featuredPlacements.gameId))
      .orderBy(asc(featuredPlacements.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.sortOrder)),
  ]);
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg font-bold text-fg">Homepage hero</h2>
        <p className="mb-4 text-sm text-fg-muted">Feature a game from Admin → Games (star button). Paid placements always display a “Sponsored” label with the sponsor name.</p>
        <ul className="surface divide-y divide-line">
          {featured.length === 0 ? <li className="p-4 text-sm text-fg-muted">Nothing featured.</li> : null}
          {featured.map(({ f, title }) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <span className="tabular w-6 text-fg-subtle">{f.sortOrder}</span>
              <span className="font-semibold text-fg">{title}</span>
              {f.headline ? <span className="text-fg-muted">“{f.headline}”</span> : null}
              {f.sponsored ? <Badge tone="warning">Sponsored · {f.sponsorName}</Badge> : <Badge>editorial</Badge>}
              {f.endsAt ? <span className="text-xs text-fg-subtle">until {f.endsAt.toLocaleString()}</span> : null}
              <ActionButton size="sm" variant="ghost" className="ml-auto" action={removeFeaturedAction.bind(null, f.id)} success="Removed from hero">
                Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-fg">Categories</h2>
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <div className="flex-1">
              <CategoryForm initial={c} />
            </div>
            <ActionButton size="sm" variant="ghost" action={deleteCategoryAction.bind(null, c.id)} confirm={`Delete ${c.name}?`} success="Category deleted">
              Delete
            </ActionButton>
          </div>
        ))}
        <div className="surface p-4">
          <p className="mb-2 text-sm font-semibold text-fg">Add category</p>
          <CategoryForm />
        </div>
      </section>
    </div>
  );
}

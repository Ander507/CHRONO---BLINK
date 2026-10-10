import type { Metadata } from "next";
import { ListingForm } from "@/components/developer/listing-form";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

export const metadata: Metadata = { title: "New game", robots: { index: false } };

export default async function NewGamePage() {
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(categories.sortOrder);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-extrabold text-fg">New game listing</h1>
      <p className="mb-6 text-sm text-fg-muted">Listings stay private until a build is approved by a reviewer.</p>
      <div className="surface p-5 sm:p-6">
        <ListingForm categories={cats} />
      </div>
    </div>
  );
}

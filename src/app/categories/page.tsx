import type { Metadata } from "next";
import { CategoryTiles } from "@/components/games/category-tiles";
import { PageHeader } from "@/components/ui/misc";
import { categoriesWithCounts } from "@/server/services/catalog";

export const metadata: Metadata = {
  title: "Game categories",
  description: "Explore free browser games by genre — action, arcade, survival, puzzle, racing, strategy and more.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const cats = await categoriesWithCounts();
  return (
    <div>
      <PageHeader title="Categories" description="Every genre on ChronoBlink. Categories without games yet are marked — we never pad them with placeholders." />
      <CategoryTiles categories={cats} />
    </div>
  );
}

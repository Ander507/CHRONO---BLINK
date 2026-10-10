export type CatalogSearchParams = { sort?: string; device?: string; page?: string; q?: string };
export type CatalogSort = "new" | "popular" | "az";
export type CatalogDevice = "desktop" | "mobile" | null;

export function parseCatalogParams(sp: CatalogSearchParams): { sort: CatalogSort; device: CatalogDevice; page: number } {
  const sort: CatalogSort = sp.sort === "popular" || sp.sort === "az" ? sp.sort : "new";
  const device: CatalogDevice = sp.device === "mobile" || sp.device === "desktop" ? sp.device : null;
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  return { sort, device, page };
}

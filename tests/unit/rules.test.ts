import { describe, expect, it } from "vitest";
import { COSMETICS, cosmeticUnlocked, levelForXp, levelProgress, xpForLevel } from "@/lib/progression";
import { periodEnd, periodStart } from "@/server/services/leaderboards";
import { parseCatalogParams } from "@/lib/catalog-params";

describe("levels", () => {
  it("maps XP to levels with a quadratic curve", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(xpForLevel(10))).toBe(10);
    expect(levelForXp(xpForLevel(10) - 1)).toBe(9);
    expect(levelForXp(-10)).toBe(1);
  });
  it("reports progress within the current level", () => {
    const p = levelProgress(75);
    expect(p.level).toBe(2);
    expect(p.current).toBe(25);
    expect(p.needed).toBe(150);
  });
  it("gates cosmetics by level only", () => {
    const gold = COSMETICS.find((c) => c.id === "frame-chrono")!;
    expect(cosmeticUnlocked(gold, 9)).toBe(false);
    expect(cosmeticUnlocked(gold, 10)).toBe(true);
  });
});

describe("leaderboard periods (UTC)", () => {
  const now = new Date("2026-10-10T15:30:00Z"); // a Saturday in Q4
  it("computes period starts", () => {
    expect(periodStart("daily", now)?.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(periodStart("weekly", now)?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodStart("season", now)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
  it("computes period ends for rollover", () => {
    expect(periodEnd("daily", now)?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(periodEnd("weekly", now)?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(periodEnd("season", now)?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("treats Sunday as the end of the ISO week", () => {
    expect(periodStart("weekly", new Date("2026-10-11T23:59:00Z"))?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodStart("weekly", new Date("2026-10-12T00:00:01Z"))?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("catalog params", () => {
  it("sanitises untrusted query params", () => {
    expect(parseCatalogParams({ sort: "drop table", device: "fridge", page: "-4" })).toEqual({ sort: "new", device: null, page: 1 });
    expect(parseCatalogParams({ sort: "popular", device: "mobile", page: "999999" })).toEqual({ sort: "popular", device: "mobile", page: 500 });
  });
});

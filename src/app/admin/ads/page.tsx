import { sql } from "drizzle-orm";
import { PlacementForm } from "@/components/admin/admin-controls";
import { FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { requireRole } from "@/server/session";
import { getPlacements, isLive } from "@/server/services/ads";

export const metadata = { title: "Advertising" };

const LABELS: Record<string, string> = {
  home_banner: "Homepage banner (display)",
  catalog_inline: "Catalog inline (display)",
  game_sidebar: "Game page sidebar (display, never over the game)",
  interstitial: "In-game natural-break interstitial",
  rewarded: "In-game optional rewarded ad",
};

export default async function AdsPage() {
  await requireRole("admin");
  const placements = await getPlacements();
  const stats = await db.execute<{ placement_key: string; event: string; n: number }>(
    sql`select placement_key, event, count(*)::int as n from ad_events where created_at > now() - interval '30 days' group by 1, 2`,
  );
  return (
    <div className="space-y-6">
      <FormMessage tone="info">
        Ads stay off until a placement is enabled with credentials from an approved provider account. Even then they only render for visitors who consented to
        advertising, respect frequency caps, pause and mute the game, and never cover gameplay controls. Remember to add the provider&apos;s script/frame origins to
        CSP_EXTRA_SCRIPT_SRC / CSP_EXTRA_FRAME_SRC. Ad events below are request/lifecycle logs — they are not revenue.
      </FormMessage>
      {Object.values(placements).map((p) => {
        const rows = stats.filter((s) => s.placement_key === p.key);
        return (
          <section key={p.key} className="surface p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-fg">{LABELS[p.key]}</h2>
              <Badge tone={isLive(p) ? "success" : "neutral"}>{isLive(p) ? "live" : "off"}</Badge>
              <span className="ml-auto text-xs text-fg-subtle">
                30d: {rows.length ? rows.map((r) => `${r.event} ${r.n}`).join(" · ") : "no events"}
              </span>
            </div>
            <PlacementForm
              placementKey={p.key}
              initial={{
                enabled: p.enabled,
                provider: p.provider,
                clientId: p.config.clientId ?? "",
                slotId: p.config.slotId ?? "",
                frequencyCapSeconds: p.frequencyCapSeconds,
              }}
            />
          </section>
        );
      })}
    </div>
  );
}

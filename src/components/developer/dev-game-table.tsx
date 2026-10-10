import Image from "next/image";
import Link from "next/link";
import { STATUS_TONE, statusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import { mediaUrl } from "@/server/services/storage";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: string;
  coverKey: string | null;
  updatedAt: Date;
  versions: number;
  latestVersionStatus: string | null;
};

export function DevGameTable({ games }: { games: Row[] }) {
  return (
    <ul className="surface divide-y divide-line" data-testid="dev-games">
      {games.map((g) => {
        const cover = mediaUrl(g.coverKey);
        return (
          <li key={g.id} className="flex flex-wrap items-center gap-4 p-4">
            <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-overlay">
              {cover ? <Image src={cover} alt="" fill sizes="96px" className="object-cover" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/developers/games/${g.id}/edit`} className="font-semibold text-fg hover:text-primary-hover">
                {g.title}
              </Link>
              <p className="text-xs text-fg-subtle">
                /{g.slug} · {g.versions} {g.versions === 1 ? "build" : "builds"} · updated {timeAgo(g.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[g.status] ?? "neutral"}>{statusLabel(g.status)}</Badge>
              {g.latestVersionStatus && g.latestVersionStatus !== "live" ? (
                <Badge tone={STATUS_TONE[g.latestVersionStatus] ?? "neutral"}>build: {statusLabel(g.latestVersionStatus)}</Badge>
              ) : null}
            </div>
            <div className="flex gap-3 text-sm font-semibold">
              <Link href={`/developers/games/${g.id}/edit`} className="text-fg-muted hover:text-fg">
                Manage
              </Link>
              {g.status === "published" ? (
                <Link href={`/play/${g.slug}`} className="text-electric hover:underline">
                  View live
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

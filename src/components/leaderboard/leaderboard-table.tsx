import { Crown, Medal } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/brand";
import { cn, formatNumber } from "@/lib/utils";

export type LbRow = {
  rank: number;
  userId: string;
  username: string | null;
  name: string;
  avatarHue: number;
  avatarGlyph: string;
  frameId: string | null;
  score: number;
  isMe?: boolean;
};

export function LeaderboardTable({ rows, compact }: { rows: LbRow[]; compact?: boolean }) {
  return (
    <ol className="divide-y divide-line" data-testid="leaderboard-rows">
      {rows.map((r) => (
        <li
          key={r.userId}
          className={cn("flex items-center gap-3 py-2.5", compact ? "px-1" : "px-3", r.isMe && "rounded-xl bg-primary-soft")}
        >
          <span className="tabular w-7 shrink-0 text-center text-sm font-bold text-fg-muted">
            {r.rank === 1 ? (
              <Crown className="mx-auto size-4 text-warning" aria-label="1st" />
            ) : r.rank <= 3 ? (
              <Medal className={cn("mx-auto size-4", r.rank === 2 ? "text-slate-300" : "text-amber-600")} aria-label={`${r.rank}${r.rank === 2 ? "nd" : "rd"}`} />
            ) : (
              r.rank
            )}
          </span>
          <Avatar hue={r.avatarHue} glyph={r.avatarGlyph} frameId={r.frameId} size={compact ? 28 : 34} />
          <span className="min-w-0 flex-1">
            {r.username ? (
              <Link href={`/profile/${r.username}`} className="block truncate text-sm font-semibold text-fg hover:text-primary-hover">
                {r.username}
                {r.isMe ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">(you)</span> : null}
              </Link>
            ) : (
              <span className="block truncate text-sm font-semibold text-fg">{r.name}</span>
            )}
          </span>
          <span className="tabular font-display text-sm font-bold text-fg">{formatNumber(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}

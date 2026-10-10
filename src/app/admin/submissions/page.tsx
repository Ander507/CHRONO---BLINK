import { Inbox } from "lucide-react";
import { ReviewCard } from "@/components/admin/review-card";
import { STATUS_TONE, statusLabel } from "@/lib/status";
import { Badge, EmptyState } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import { recentReviews, reviewQueue } from "@/server/services/admin";
import { mediaUrl } from "@/server/services/storage";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage() {
  const [queue, recent] = await Promise.all([reviewQueue(), recentReviews()]);
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 font-display text-lg font-bold text-fg">Review queue ({queue.length})</h2>
        {queue.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Nothing waiting for review" />
        ) : (
          <div className="space-y-5">
            {queue.map((q) => (
              <ReviewCard
                key={q.version.id}
                item={{
                  versionId: q.version.id,
                  version: q.version.version,
                  notes: q.version.notes,
                  fileCount: q.version.fileCount,
                  totalBytes: q.version.totalBytes,
                  scanStatus: q.version.scanStatus,
                  scanDetails: q.version.scanDetails,
                  warnings: q.version.validationReport?.warnings ?? [],
                  submittedAt: q.version.submittedAt?.toISOString() ?? null,
                  game: { title: q.game.title, slug: q.game.slug, status: q.game.status, cover: mediaUrl(q.game.coverKey), description: q.game.description },
                  studio: q.studio,
                  trusted: Boolean(q.trusted),
                }}
              />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 font-display text-lg font-bold text-fg">Recently reviewed</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-fg-muted">No reviews yet.</p>
        ) : (
          <ul className="surface divide-y divide-line">
            {recent.map((r) => (
              <li key={r.version.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold text-fg">
                  {r.title} v{r.version.version}
                </span>
                <Badge tone={STATUS_TONE[r.version.status] ?? "neutral"}>{statusLabel(r.version.status)}</Badge>
                <span className="text-fg-subtle">{r.version.reviewedAt ? timeAgo(r.version.reviewedAt) : ""}</span>
                {r.version.reviewNotes ? <span className="w-full text-xs text-fg-muted">{r.version.reviewNotes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

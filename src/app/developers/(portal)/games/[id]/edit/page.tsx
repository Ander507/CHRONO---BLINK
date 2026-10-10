import { eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildUploader, CoverUploader, VersionList } from "@/components/developer/build-manager";
import { STATUS_TONE, statusLabel } from "@/lib/status";
import { ListingForm } from "@/components/developer/listing-form";
import { Section } from "@/components/settings/settings-forms";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { categories, developers } from "@/server/db/schema";
import { HttpError, requireUser } from "@/server/session";
import { getEditableGame, uploadPolicy, versionsForGame } from "@/server/services/developer";
import { mediaUrl } from "@/server/services/storage";

export const metadata: Metadata = { title: "Manage game", robots: { index: false } };

export default async function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/developers/games/${id}/edit`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const game = await getEditableGame(user, id).catch((e) => {
    if (e instanceof HttpError) notFound();
    throw e;
  });
  const [cats, versions, dev] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(categories.sortOrder),
    versionsForGame(game.id),
    game.developerId ? db.query.developers.findFirst({ where: eq(developers.id, game.developerId) }) : null,
  ]);
  const policy = dev ? uploadPolicy(user, dev) : { allowed: user.role === "admin", reason: "First-party games are published from the repository." };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold text-fg">{game.title}</h1>
        <Badge tone={STATUS_TONE[game.status] ?? "neutral"}>{statusLabel(game.status)}</Badge>
        {game.status === "published" || game.status === "unlisted" ? (
          <Link href={`/play/${game.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-electric hover:underline">
            View live <ExternalLink className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {game.statusReason ? <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{game.statusReason}</p> : null}

      <Section title="Builds" description="Upload a ZIP, check the validation report, preview it in the player sandbox, then submit it for review.">
        <div className="space-y-6">
          <BuildUploader gameId={game.id} policy={policy} />
          <VersionList
            hasCover={Boolean(game.coverKey)}
            versions={versions.map((v) => ({
              id: v.id,
              version: v.version,
              status: v.status,
              notes: v.notes,
              fileCount: v.fileCount,
              totalBytes: v.totalBytes,
              scanStatus: v.scanStatus,
              reviewNotes: v.reviewNotes,
              createdAt: v.createdAt.toISOString(),
              errors: v.validationReport?.errors ?? [],
              warnings: v.validationReport?.warnings ?? [],
            }))}
          />
        </div>
      </Section>

      <Section title="Artwork" description="Your cover is the first thing players see. Original or properly licensed art only.">
        <CoverUploader gameId={game.id} cover={mediaUrl(game.coverKey)} portrait={mediaUrl(game.coverPortraitKey)} />
      </Section>

      <Section title="Listing">
        <ListingForm
          gameId={game.id}
          categories={cats}
          slugLocked={game.status === "published"}
          initial={{
            title: game.title,
            slug: game.slug,
            shortDescription: game.shortDescription,
            description: game.description,
            instructions: game.instructions,
            categoryId: game.categoryId ?? cats[0]?.id ?? 1,
            tags: game.tags,
            controls: game.controls.length ? game.controls : [{ action: "", keys: "" }],
            orientation: game.orientation,
            supportsDesktop: game.supportsDesktop,
            supportsMobile: game.supportsMobile,
          }}
        />
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormMessage } from "@/components/ui/form";
import { env } from "@/server/env";
import { IFRAME_ALLOW, IFRAME_SANDBOX } from "@/server/game-host-policy";

export const metadata: Metadata = { title: "Build preview", robots: { index: false } };

/**
 * Private preview of an unreviewed build. The signed URL (minted by
 * previewAction for the build's owner or staff) expires after 30 minutes.
 * The frame uses the same sandbox as the public player. The SDK isn't
 * connected here, so the game runs in its standalone mode.
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const url = (await searchParams).url ?? "";
  if (!url.startsWith(`${env.GAME_ORIGIN}/p/`)) notFound();
  return (
    <div className="space-y-4">
      <FormMessage tone="info">
        Private preview in the production sandbox. The SDK runs in standalone mode here (no scores or cloud saves). This link expires 30 minutes after it was
        created.
      </FormMessage>
      <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-black">
        <iframe src={url} title="Build preview" sandbox={IFRAME_SANDBOX} allow={IFRAME_ALLOW} referrerPolicy="no-referrer" className="size-full border-0" />
      </div>
    </div>
  );
}

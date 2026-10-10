"use client";

import { Check, ExternalLink, X } from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { toast } from "sonner";
import { approveVersionAction, rejectVersionAction } from "@/app/actions/admin";
import { previewAction } from "@/app/actions/developer";
import { useAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";

export type ReviewItem = {
  versionId: string;
  version: number;
  notes: string;
  fileCount: number;
  totalBytes: number;
  scanStatus: string;
  scanDetails: string | null;
  warnings: string[];
  submittedAt: string | null;
  game: { title: string; slug: string; status: string; cover: string | null; description: string };
  studio: string | null;
  trusted: boolean;
};

export function ReviewCard({ item }: { item: ReviewItem }) {
  const { pending, exec } = useAction();
  const [notes, setNotes] = React.useState("");
  const [origins, setOrigins] = React.useState("");
  const [lb, setLb] = React.useState({ enabled: true, maxScore: 1_000_000, maxScorePerSecond: 500, minRunSeconds: 5 });
  return (
    <article className="surface overflow-hidden" data-testid="review-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        <span className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-overlay sm:w-56">
          {item.game.cover ? <Image src={item.game.cover} alt="" fill sizes="224px" className="object-cover" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-fg">
              {item.game.title} <span className="text-fg-subtle">v{item.version}</span>
            </h3>
            <Badge tone={item.game.status === "published" ? "success" : "neutral"}>{item.game.status === "published" ? "update" : "new game"}</Badge>
            {item.trusted ? <Badge tone="success">verified studio</Badge> : null}
          </div>
          <p className="text-xs text-fg-subtle">
            {item.studio ?? "Staff"} · {item.fileCount} files · {(item.totalBytes / 1048576).toFixed(2)} MB · scan: {item.scanStatus.replace(/_/g, " ")}
            {item.submittedAt ? ` · submitted ${new Date(item.submittedAt).toLocaleString()}` : ""}
          </p>
          <p className="mt-2 text-sm text-fg-muted">{item.game.description}</p>
          {item.notes ? <p className="mt-2 text-sm text-fg">Release notes: {item.notes}</p> : null}
          {item.warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-warning">
              {item.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={async () => {
              const r = await previewAction(item.versionId);
              if (r.ok) window.open(`/developers/preview?url=${encodeURIComponent(r.url)}`, "_blank", "noopener");
              else toast.error(r.error);
            }}
          >
            <ExternalLink /> Open sandboxed preview
          </Button>
        </div>
      </div>
      <div className="grid gap-4 border-t border-line bg-ink/40 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-fg">Leaderboard plausibility bounds</p>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <Checkbox checked={lb.enabled} onChange={(e) => setLb({ ...lb, enabled: e.target.checked })} /> Create / update the provisional “highscore” board
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Max score" htmlFor={`ms-${item.versionId}`}>
              <Input id={`ms-${item.versionId}`} type="number" value={lb.maxScore} onChange={(e) => setLb({ ...lb, maxScore: Number(e.target.value) })} />
            </Field>
            <Field label="Max pts / sec" htmlFor={`pps-${item.versionId}`}>
              <Input id={`pps-${item.versionId}`} type="number" value={lb.maxScorePerSecond} onChange={(e) => setLb({ ...lb, maxScorePerSecond: Number(e.target.value) })} />
            </Field>
            <Field label="Min run (s)" htmlFor={`mr-${item.versionId}`}>
              <Input id={`mr-${item.versionId}`} type="number" value={lb.minRunSeconds} onChange={(e) => setLb({ ...lb, minRunSeconds: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Extra CSP origins (optional)" htmlFor={`csp-${item.versionId}`} hint="https origins only, comma separated, e.g. https://fonts.gstatic.com">
            <Input id={`csp-${item.versionId}`} value={origins} onChange={(e) => setOrigins(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Reviewer notes" htmlFor={`notes-${item.versionId}`} hint="Required when rejecting; sent to the developer.">
            <Textarea id={`notes-${item.versionId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                exec(
                  () =>
                    approveVersionAction(item.versionId, {
                      notes,
                      cspExtraOrigins: origins
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      leaderboard: lb,
                    }),
                  "Approved and published",
                )
              }
              data-testid="approve"
            >
              <Check /> Approve & publish
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => exec(() => rejectVersionAction(item.versionId, notes), "Rejected — developer notified")}>
              <X /> Reject
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

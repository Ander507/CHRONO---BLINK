"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, FileArchive, Image as ImageIcon, Loader2, Send, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  discardVersionAction,
  previewAction,
  processVersionAction,
  requestUploadAction,
  submitVersionAction,
  uploadCoverAction,
} from "@/app/actions/developer";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/form";
import { Badge, Progress } from "@/components/ui/misc";
import { STATUS_TONE, statusLabel } from "@/lib/status";
import { cn, timeAgo } from "@/lib/utils";

export type VersionRow = {
  id: string;
  version: number;
  status: string;
  notes: string;
  fileCount: number;
  totalBytes: number;
  scanStatus: string;
  reviewNotes: string | null;
  createdAt: string;
  errors: string[];
  warnings: string[];
};

export { STATUS_TONE, statusLabel };

export function CoverUploader({ gameId, cover, portrait }: { gameId: string; cover: string | null; portrait: string | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const upload = (kind: "cover" | "cover_portrait") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    start(async () => {
      const r = await uploadCoverAction(gameId, fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Artwork uploaded");
      router.refresh();
    });
  };
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
      {(
        [
          ["cover", "Landscape cover · 16:9 · 1920×1080 recommended", cover, "aspect-video"],
          ["cover_portrait", "Portrait cover · 2:3 (optional)", portrait, "aspect-[2/3] max-h-64"],
        ] as const
      ).map(([kind, label, src, aspect]) => (
        <label key={kind} className="group block cursor-pointer">
          <span className="mb-2 block text-sm font-semibold text-fg">{label}</span>
          <span className={cn("relative grid place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-ink/60 group-hover:border-primary", aspect)}>
            {src ? <Image src={src} alt="" fill sizes="400px" className="object-cover" /> : null}
            <span className="relative flex items-center gap-2 rounded-lg bg-ink/80 px-3 py-2 text-xs font-semibold text-fg-muted">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />} {src ? "Replace" : "Upload"} PNG/JPEG/WebP ≤ 3 MB
            </span>
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={upload(kind)} disabled={pending} />
        </label>
      ))}
    </div>
  );
}

export function BuildUploader({ gameId, policy }: { gameId: string; policy: { allowed: boolean; reason: string | null } }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [notes, setNotes] = React.useState("");
  const [stage, setStage] = React.useState<"idle" | "reserving" | "uploading" | "validating">("idle");
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!policy.allowed) {
    return <FormMessage tone="info">{policy.reason}</FormMessage>;
  }

  async function go() {
    if (!file) return;
    setError(null);
    setResult(null);
    setStage("reserving");
    const reserve = await requestUploadAction(gameId, file.size, notes);
    if (!reserve.ok) {
      setStage("idle");
      return setError(reserve.error);
    }
    setStage("uploading");
    setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(reserve.upload.method, reserve.upload.url);
        for (const [k, v] of Object.entries(reserve.upload.headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });
    } catch (e) {
      setStage("idle");
      return setError((e as Error).message);
    }
    setStage("validating");
    const processed = await processVersionAction(reserve.versionId);
    setStage("idle");
    if (!processed.ok) return setError(processed.error);
    setResult({ valid: processed.valid, errors: processed.errors, warnings: processed.warnings });
    setFile(null);
    setNotes("");
    if (processed.valid) toast.success(`Build v${reserve.version} validated — preview it, then submit for review`);
    router.refresh();
  }

  const busy = stage !== "idle";
  return (
    <div className="space-y-4">
      <FormMessage>{error}</FormMessage>
      {result ? (
        <div className={cn("rounded-xl border p-4 text-sm", result.valid ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")} data-testid="build-result">
          <p className={cn("flex items-center gap-2 font-semibold", result.valid ? "text-success" : "text-danger")}>
            {result.valid ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            {result.valid ? "Build passed validation" : "Build rejected"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
            {result.errors.map((e) => (
              <li key={e} className="text-danger">
                {e}
              </li>
            ))}
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-ink/50 px-4 py-8 text-center hover:border-primary">
        <FileArchive className="size-7 text-fg-subtle" />
        <span className="text-sm font-semibold text-fg">{file ? file.name : "Choose a .zip of your HTML5 build"}</span>
        <span className="text-xs text-fg-subtle">index.html at the root · ≤ 100 MB zipped · ≤ 250 MB unpacked · ≤ 2000 files</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          data-testid="build-input"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <Input placeholder="What changed in this build? (optional)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
      {stage === "uploading" ? <Progress value={progress} label="Upload progress" /> : null}
      <Button onClick={go} disabled={!file || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {stage === "reserving" ? "Preparing…" : stage === "uploading" ? `Uploading ${Math.round(progress * 100)}%` : stage === "validating" ? "Validating & scanning…" : "Upload build"}
      </Button>
    </div>
  );
}

export function VersionList({ versions, hasCover }: { versions: VersionRow[]; hasCover: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    toast.success(success);
    router.refresh();
  }
  if (versions.length === 0) return <p className="text-sm text-fg-muted">No builds yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line" data-testid="version-list">
      {versions.map((v) => (
        <li key={v.id} className="p-4" data-testid={`version-${v.version}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-bold text-fg">v{v.version}</span>
            <Badge tone={STATUS_TONE[v.status] ?? "neutral"} data-testid="version-status">
              {statusLabel(v.status)}
            </Badge>
            <span className="text-xs text-fg-subtle">
              {timeAgo(v.createdAt)}
              {v.fileCount ? ` · ${v.fileCount} files · ${(v.totalBytes / 1048576).toFixed(2)} MB` : ""} · scan: {statusLabel(v.scanStatus)}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {["ready", "in_review", "rejected"].includes(v.status) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === v.id}
                  onClick={async () => {
                    const r = await previewAction(v.id);
                    if (r.ok) window.open(`/developers/preview?url=${encodeURIComponent(r.url)}`, "_blank", "noopener");
                    else toast.error(r.error);
                  }}
                >
                  <ExternalLink /> Preview
                </Button>
              ) : null}
              {v.status === "ready" ? (
                <Button size="sm" disabled={busy === v.id || !hasCover} title={hasCover ? undefined : "Upload cover art first"} onClick={() => act(v.id, () => submitVersionAction(v.id), "Submitted for review")}>
                  <Send /> Submit for review
                </Button>
              ) : null}
              {["pending_upload", "invalid", "ready", "rejected"].includes(v.status) ? (
                <Button size="sm" variant="ghost" disabled={busy === v.id} onClick={() => act(v.id, () => discardVersionAction(v.id), "Build discarded")} aria-label={`Discard v${v.version}`}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
          {v.notes ? <p className="mt-1.5 text-sm text-fg-muted">{v.notes}</p> : null}
          {v.reviewNotes ? (
            <p className={cn("mt-2 rounded-lg px-3 py-2 text-sm", v.status === "rejected" ? "bg-danger/10 text-danger" : "bg-raised text-fg-muted")}>
              <span className="font-semibold">Reviewer:</span> {v.reviewNotes}
            </p>
          ) : null}
          {v.errors.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-danger">
              {v.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {v.warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-warning">
              {v.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

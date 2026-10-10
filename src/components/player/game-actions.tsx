"use client";

import { Flag, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { submitReport } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";

export function ShareButton({ title, url }: { title: string; url: string }) {
  async function share() {
    const full = new URL(url, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Play ${title} on ChronoBlink Arcade`, url: full });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg"
      aria-label={`Share ${title}`}
      title="Share"
    >
      <Share2 className="size-5" />
    </button>
  );
}

const REASONS = [
  ["broken", "Doesn't load or is broken"],
  ["inappropriate", "Inappropriate content"],
  ["malicious", "Suspicious or malicious behaviour"],
  ["copyright", "Copyright or trademark issue"],
  ["other", "Something else"],
] as const;

export function ReportDialog({ gameId, title }: { gameId: string; title: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [reason, setReason] = React.useState<(typeof REASONS)[number][0]>("broken");
  const [details, setDetails] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg"
          aria-label="Report a problem"
          title="Report a problem"
        >
          <Flag className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent title={`Report ${title}`} description="Reports go to our moderation team. Thanks for helping keep ChronoBlink safe.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await submitReport({ gameId, reason, details });
              if (r.ok) {
                toast.success("Report sent — thank you");
                setOpen(false);
                setDetails("");
              } else toast.error(r.error ?? "Couldn't send report");
            });
          }}
        >
          <Field label="What's wrong?" htmlFor="report-reason">
            <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)" htmlFor="report-details" hint="Max 1000 characters">
            <Textarea id="report-details" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

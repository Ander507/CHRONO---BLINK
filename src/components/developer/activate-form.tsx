"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { activateDeveloperAction } from "@/app/actions/developer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input, Textarea } from "@/components/ui/form";

export function ActivateDeveloperForm() {
  const router = useRouter();
  const [f, setF] = React.useState({ studioName: "", website: "", bio: "", agree: false });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await activateDeveloperAction(f);
          if (!r.ok) return setError(r.error);
          router.push("/developers/dashboard");
          router.refresh();
        });
      }}
    >
      <FormMessage>{error}</FormMessage>
      <Field label="Studio or developer name" htmlFor="studio">
        <Input id="studio" value={f.studioName} maxLength={60} onChange={(e) => setF({ ...f, studioName: e.target.value })} />
      </Field>
      <Field label="Website (optional)" htmlFor="website" hint="Must start with https://">
        <Input id="website" type="url" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="About (optional)" htmlFor="bio">
        <Textarea id="bio" value={f.bio} maxLength={500} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-fg-muted">
        <Checkbox checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="mt-0.5" />
        <span>
          I accept the{" "}
          <Link href="/legal/developer-agreement" target="_blank" className="text-electric hover:underline">
            Developer Agreement
          </Link>{" "}
          and confirm I own or have licensed everything I upload.
        </span>
      </label>
      <Button type="submit" disabled={pending || !f.studioName || !f.agree}>
        {pending ? <Loader2 className="animate-spin" /> : null} Activate developer account
      </Button>
    </form>
  );
}

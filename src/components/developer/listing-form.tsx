"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { createGameAction, updateGameAction } from "@/app/actions/developer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import type { GameListingInput } from "@/lib/validation";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function ListingForm({
  categories,
  initial,
  gameId,
  slugLocked,
}: {
  categories: { id: number; name: string }[];
  initial?: GameListingInput;
  gameId?: string;
  slugLocked?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = React.useState<GameListingInput>(
    initial ?? {
      title: "",
      slug: "",
      shortDescription: "",
      description: "",
      instructions: "",
      categoryId: categories[0]?.id ?? 1,
      tags: [],
      controls: [{ action: "Move", keys: "" }],
      orientation: "any",
      supportsDesktop: true,
      supportsMobile: false,
    },
  );
  const [slugTouched, setSlugTouched] = React.useState(Boolean(initial));
  const [tagsText, setTagsText] = React.useState((initial?.tags ?? []).join(", "));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const set = <K extends keyof GameListingInput>(k: K, v: GameListingInput[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const payload = {
          ...f,
          tags: tagsText
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
          controls: f.controls.filter((c) => c.action.trim() && c.keys.trim()),
        };
        start(async () => {
          const r = gameId ? await updateGameAction(gameId, payload) : await createGameAction(payload);
          if (!r.ok) return setError(r.error);
          toast.success(gameId ? "Listing saved" : "Game created — now add cover art and upload a build");
          if (!gameId && "id" in r) router.push(`/developers/games/${r.id}/edit`);
          else router.refresh();
        });
      }}
    >
      <FormMessage>{error}</FormMessage>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input
            id="title"
            value={f.title}
            maxLength={60}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="URL slug" htmlFor="slug" hint={slugLocked ? "Locked after publishing" : `chronoblink.xyz/play/${f.slug || "your-game"}`}>
          <Input
            id="slug"
            value={f.slug}
            disabled={slugLocked}
            maxLength={48}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
          />
        </Field>
      </div>
      <Field label="Short description" htmlFor="short" hint={`${f.shortDescription.length}/160 — shown on cards and in search results`}>
        <Input id="short" value={f.shortDescription} maxLength={160} onChange={(e) => set("shortDescription", e.target.value)} />
      </Field>
      <Field label="Full description" htmlFor="desc" hint="40–4000 characters. Separate paragraphs with a blank line.">
        <Textarea id="desc" value={f.description} maxLength={4000} rows={6} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="How to play" htmlFor="instr">
        <Textarea id="instr" value={f.instructions} maxLength={1000} rows={3} onChange={(e) => set("instructions", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="cat">
          <Select id="cat" value={f.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Orientation" htmlFor="orient">
          <Select id="orient" value={f.orientation} onChange={(e) => set("orientation", e.target.value as GameListingInput["orientation"])}>
            <option value="any">Any</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </Select>
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated, up to 8">
          <Input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-fg">
          <Checkbox checked={f.supportsDesktop} onChange={(e) => set("supportsDesktop", e.target.checked)} /> Desktop (keyboard/mouse)
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <Checkbox checked={f.supportsMobile} onChange={(e) => set("supportsMobile", e.target.checked)} /> Mobile (touch)
        </label>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-fg">Controls</p>
        <div className="space-y-2">
          {f.controls.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label="Action"
                placeholder="Action (e.g. Jump)"
                value={c.action}
                maxLength={40}
                onChange={(e) => set("controls", f.controls.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))}
              />
              <Input
                aria-label="Keys"
                placeholder="Keys (e.g. Space / tap)"
                value={c.keys}
                maxLength={60}
                onChange={(e) => set("controls", f.controls.map((x, j) => (j === i ? { ...x, keys: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove control" onClick={() => set("controls", f.controls.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {f.controls.length < 12 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("controls", [...f.controls, { action: "", keys: "" }])}>
              <Plus /> Add control
            </Button>
          ) : null}
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} {gameId ? "Save listing" : "Create game"}
      </Button>
    </form>
  );
}

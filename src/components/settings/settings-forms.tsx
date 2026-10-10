"use client";

import { Download, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { importDeviceSaves, updatePrivacy, updateProfile } from "@/app/actions/account";
import { Avatar, NamedIcon } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { clearGuestSaves, listGuestSaves } from "@/lib/local";
import { AVATAR_GLYPHS, COSMETICS, cosmeticUnlocked } from "@/lib/progression";
import { cn } from "@/lib/utils";

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

type ProfileInit = { name: string; bio: string; avatarHue: number; avatarGlyph: string; frameId: string | null; themeId: string | null; level: number };

export function ProfileForm({ initial }: { initial: ProfileInit }) {
  const router = useRouter();
  const [f, setF] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await updateProfile({
            name: f.name,
            bio: f.bio,
            avatarHue: f.avatarHue,
            avatarGlyph: f.avatarGlyph,
            frameId: f.frameId,
            themeId: f.themeId,
          });
          if (!r.ok) return setError(r.error);
          toast.success("Profile saved");
          router.refresh();
        });
      }}
    >
      <FormMessage>{error}</FormMessage>
      <div className="flex items-center gap-5">
        <Avatar hue={f.avatarHue} glyph={f.avatarGlyph} frameId={f.frameId} size={72} label="Avatar preview" />
        <div className="flex-1 space-y-2">
          <label htmlFor="hue" className="text-sm font-semibold text-fg">
            Avatar colour
          </label>
          <input
            id="hue"
            type="range"
            min={0}
            max={359}
            value={f.avatarHue}
            onChange={(e) => setF({ ...f, avatarHue: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-fg">Avatar icon</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar icon">
          {AVATAR_GLYPHS.map((g) => (
            <button
              type="button"
              key={g}
              role="radio"
              aria-checked={f.avatarGlyph === g}
              aria-label={g}
              onClick={() => setF({ ...f, avatarGlyph: g })}
              className={cn(
                "grid size-11 place-items-center rounded-xl border [&_svg]:size-5",
                f.avatarGlyph === g ? "border-primary bg-primary-soft text-fg" : "border-line text-fg-muted hover:border-line-strong",
              )}
            >
              <NamedIcon name={g} />
            </button>
          ))}
        </div>
      </div>
      <CosmeticPicker kind="frame" value={f.frameId} level={initial.level} onChange={(v) => setF({ ...f, frameId: v })} />
      <CosmeticPicker kind="theme" value={f.themeId} level={initial.level} onChange={(v) => setF({ ...f, themeId: v })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="name">
          <Input id="name" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
      </div>
      <Field label="Bio" htmlFor="bio" hint={`${f.bio.length}/280`}>
        <Textarea id="bio" value={f.bio} maxLength={280} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save profile
      </Button>
    </form>
  );
}

function CosmeticPicker({ kind, value, level, onChange }: { kind: "frame" | "theme"; value: string | null; level: number; onChange: (v: string | null) => void }) {
  const items = COSMETICS.filter((c) => c.kind === kind);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-fg">
        {kind === "frame" ? "Avatar frame" : "Profile theme"} <span className="font-normal text-fg-subtle">· unlock more by levelling up (cosmetic only)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((c) => {
          const unlocked = cosmeticUnlocked(c, level);
          const selected = (value ?? `${kind}-${kind === "frame" ? "none" : "void"}`) === c.id;
          return (
            <button
              type="button"
              key={c.id}
              disabled={!unlocked}
              onClick={() => onChange(c.id)}
              aria-pressed={selected}
              title={unlocked ? c.name : `Unlocks at level ${c.unlock.level}`}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                selected ? "border-primary bg-primary-soft text-fg" : "border-line text-fg-muted hover:border-line-strong",
                !unlocked && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="size-4 rounded-full border border-line-strong" style={{ background: c.preview }} />
              {c.name}
              {!unlocked ? (
                <span className="inline-flex items-center gap-0.5 text-fg-subtle">
                  <Lock className="size-3" /> Lv {c.unlock.level}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PrivacyForm({ initial }: { initial: { isPublic: boolean; showActivity: boolean } }) {
  const [s, setS] = React.useState(initial);
  async function save(next: typeof s) {
    setS(next);
    const r = await updatePrivacy(next);
    if (r.ok) toast.success("Privacy settings saved");
    else toast.error(r.error);
  }
  return (
    <div className="space-y-4">
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-fg">Public profile</span>
          <span className="text-xs text-fg-muted">Others can view your profile, level and achievements. Your username still appears on leaderboards.</span>
        </span>
        <Switch checked={s.isPublic} onCheckedChange={(v) => save({ ...s, isPublic: v })} aria-label="Public profile" />
      </label>
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-fg">Show activity</span>
          <span className="text-xs text-fg-muted">Show recently played games and personal bests on your profile.</span>
        </span>
        <Switch checked={s.showActivity} onCheckedChange={(v) => save({ ...s, showActivity: v })} aria-label="Show activity" />
      </label>
    </div>
  );
}

export function PasswordForm() {
  const [cur, setCur] = React.useState("");
  const [next, setNext] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (next.length < 10) return setError("New password needs at least 10 characters.");
        setPending(true);
        const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
        setPending(false);
        if (r.error) return setError(authErrorMessage(r.error));
        setCur("");
        setNext("");
        toast.success("Password changed. Other devices were signed out.");
      }}
    >
      <FormMessage>{error}</FormMessage>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="cur">
          <Input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="new" hint="At least 10 characters">
          <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || !cur || !next}>
        Change password
      </Button>
    </form>
  );
}

export function DeviceImport() {
  const [saves, setSaves] = React.useState<ReturnType<typeof listGuestSaves>>([]);
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaves(listGuestSaves());
  }, []);
  if (saves.length === 0) return <p className="text-sm text-fg-muted">No guest progress found on this device.</p>;
  const games = [...new Set(saves.map((s) => s.gameSlug))];
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        This device has guest save data for {games.length} {games.length === 1 ? "game" : "games"} ({games.join(", ")}). Import it into your account? Existing cloud saves are never
        overwritten.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await importDeviceSaves(saves);
              if (!r.ok) return void toast.error("Import failed");
              clearGuestSaves();
              setSaves([]);
              toast.success(`Imported ${r.imported} save ${r.imported === 1 ? "slot" : "slots"}`);
            })
          }
        >
          <Upload /> Import to my account
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            clearGuestSaves();
            setSaves([]);
          }}
        >
          Discard device data
        </Button>
      </div>
    </div>
  );
}

export function DataControls({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild variant="secondary">
        <a href="/api/account/export" download>
          <Download /> Export my data (JSON)
        </a>
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger">
            <Trash2 /> Delete account
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Delete your account?"
          description="This permanently deletes your profile, XP, achievements, favorites, cloud saves and leaderboard scores. It can't be undone."
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setPending(true);
              const r = await authClient.deleteUser(hasPassword ? { password } : {});
              setPending(false);
              if (r.error) return setError(authErrorMessage(r.error));
              toast.success("Your account has been deleted");
              router.push("/");
              router.refresh();
            }}
          >
            <FormMessage>{error}</FormMessage>
            {hasPassword ? (
              <Field label="Password" htmlFor="del-pw">
                <Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            ) : null}
            <Field label='Type "DELETE" to confirm' htmlFor="del-confirm">
              <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button type="submit" variant="danger" className="w-full" disabled={pending || confirm !== "DELETE" || (hasPassword && !password)}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Permanently delete
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

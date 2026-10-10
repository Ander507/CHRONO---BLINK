"use client";

import { Star } from "lucide-react";
import * as React from "react";
import {
  addFeaturedAction,
  createAchievementAction,
  createChallengeDefinitionAction,
  resolveReportAction,
  setBanAction,
  setDeveloperAction,
  setGameVisibilityAction,
  setRoleAction,
  updateAchievementAction,
  updatePlacementAction,
  upsertCategoryAction,
} from "@/app/actions/admin";
import { ActionButton, useAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

export function GameVisibilityControls({ gameId, status, hasBuild, isAdmin }: { gameId: string; status: string; hasBuild: boolean; isAdmin: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === "unlisted" && hasBuild ? (
        <ActionButton size="sm" variant="secondary" action={() => setGameVisibilityAction(gameId, "published", "")} success="Published">
          Publish
        </ActionButton>
      ) : null}
      {status === "published" ? (
        <ActionButton size="sm" variant="secondary" action={() => setGameVisibilityAction(gameId, "unlisted", "")} success="Unlisted">
          Unlist
        </ActionButton>
      ) : null}
      {isAdmin && status !== "removed" ? (
        <ActionButton
          size="sm"
          variant="danger"
          confirm="Remove this game? Its public files are deleted and the page shows a removal notice."
          action={() => setGameVisibilityAction(gameId, "removed", window.prompt("Reason shown to players:") ?? "Removed by moderators")}
          success="Removed"
        >
          Remove
        </ActionButton>
      ) : null}
    </div>
  );
}

export function FeatureDialog({ gameId, title }: { gameId: string; title: string }) {
  const [open, setOpen] = React.useState(false);
  const { pending, exec } = useAction();
  const [f, setF] = React.useState({ headline: "", sponsored: false, sponsorName: "", sortOrder: 10, endsAt: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Feature ${title}`}>
          <Star />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Feature ${title}`} description="Adds the game to the homepage hero carousel.">
        <div className="space-y-4">
          <Field label="Headline (optional)" htmlFor="fh">
            <Input id="fh" value={f.headline} maxLength={80} onChange={(e) => setF({ ...f, headline: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order" htmlFor="fo">
              <Input id="fo" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} />
            </Field>
            <Field label="Ends (optional)" htmlFor="fe">
              <Input id="fe" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={f.sponsored} onChange={(e) => setF({ ...f, sponsored: e.target.checked })} /> Paid placement (shown with a visible “Sponsored” label)
          </label>
          {f.sponsored ? (
            <Field label="Sponsor name" htmlFor="fs">
              <Input id="fs" value={f.sponsorName} onChange={(e) => setF({ ...f, sponsorName: e.target.value })} />
            </Field>
          ) : null}
          <Button disabled={pending} onClick={() => exec(() => addFeaturedAction({ gameId, ...f }), "Featured", () => setOpen(false))}>
            Add to hero carousel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportControls({ id }: { id: number }) {
  const { pending, exec } = useAction();
  const [note, setNote] = React.useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-9 max-w-xs" placeholder="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => exec(() => resolveReportAction(id, "resolved", note), "Report resolved")}>
        Resolve
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => resolveReportAction(id, "dismissed", note), "Report dismissed")}>
        Dismiss
      </Button>
    </div>
  );
}

export function UserControls({ userId, role, banned, isAdmin, isSelf }: { userId: string; role: string; banned: boolean; isAdmin: boolean; isSelf: boolean }) {
  const { pending, exec } = useAction();
  if (isSelf) return <span className="text-xs text-fg-subtle">you</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isAdmin ? (
        <Select
          aria-label="Role"
          className="h-9 w-36"
          value={role}
          disabled={pending}
          onChange={(e) => exec(() => setRoleAction(userId, e.target.value), "Role updated")}
        >
          {["user", "developer", "moderator", "admin"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      ) : null}
      {banned ? (
        <ActionButton size="sm" variant="secondary" action={() => setBanAction(userId, false, "")} success="User unbanned">
          Unban
        </ActionButton>
      ) : (
        <ActionButton
          size="sm"
          variant="danger"
          confirm="Ban this user? They are signed out everywhere and can't sign in."
          action={() => setBanAction(userId, true, window.prompt("Reason (stored in audit log):") ?? "")}
          success="User banned"
        >
          Ban
        </ActionButton>
      )}
    </div>
  );
}

export function DeveloperControls({ devId, trusted, status }: { devId: string; trusted: boolean; status: string }) {
  const { pending, exec } = useAction();
  return (
    <div className="flex items-center justify-end gap-4">
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        Verified
        <Switch checked={trusted} disabled={pending} onCheckedChange={(v) => exec(() => setDeveloperAction(devId, { trusted: v }), v ? "Studio verified" : "Verification removed")} />
      </label>
      <ActionButton
        size="sm"
        variant={status === "active" ? "danger" : "secondary"}
        action={() => setDeveloperAction(devId, { status: status === "active" ? "suspended" : "active" })}
        success="Developer updated"
      >
        {status === "active" ? "Suspend" : "Reactivate"}
      </ActionButton>
    </div>
  );
}

export function CategoryForm({ initial }: { initial?: { id: number; slug: string; name: string; description: string; icon: string; sortOrder: number } }) {
  const { pending, exec } = useAction();
  const [f, setF] = React.useState(initial ?? { id: 0, slug: "", name: "", description: "", icon: "gamepad-2", sortOrder: 100 });
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_1fr_80px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => upsertCategoryAction(initial?.id ?? null, { slug: f.slug, name: f.name, description: f.description, icon: f.icon, sortOrder: f.sortOrder }), "Category saved");
      }}
    >
      <Input aria-label="Name" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-9" />
      <Input aria-label="Slug" placeholder="slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} className="h-9" />
      <Input aria-label="Description" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="h-9" />
      <Input aria-label="Icon" placeholder="icon" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} className="h-9" />
      <Input aria-label="Order" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} className="h-9" />
      <Button size="sm" type="submit" disabled={pending}>
        {initial ? "Save" : "Add"}
      </Button>
    </form>
  );
}

export function ChallengeDefinitionForm({ games }: { games: { id: string; title: string }[] }) {
  const { pending, exec } = useAction();
  const [f, setF] = React.useState({ gameId: games[0]?.id ?? "", type: "score_at_least", targets: "1000, 2000", titleTemplate: "Score {target} points in ", rewardXp: 100 });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        exec(
          () =>
            createChallengeDefinitionAction({
              gameId: f.gameId,
              type: f.type,
              targets: f.targets
                .split(",")
                .map((t) => Number(t.trim()))
                .filter((n) => n > 0),
              titleTemplate: f.titleTemplate,
              rewardXp: f.rewardXp,
            }),
          "Challenge definition created",
        );
      }}
    >
      <Field label="Game" htmlFor="cg">
        <Select id="cg" value={f.gameId} onChange={(e) => setF({ ...f, gameId: e.target.value })}>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type" htmlFor="ct">
        <Select id="ct" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="score_at_least">Score at least (from verified submissions)</option>
          <option value="run_seconds_at_least">Survive N seconds (server-timed run)</option>
          <option value="runs_completed">Finish N runs (≥ 10 s each)</option>
        </Select>
      </Field>
      <Field label="Targets (one picked per day)" htmlFor="ctg">
        <Input id="ctg" value={f.targets} onChange={(e) => setF({ ...f, targets: e.target.value })} />
      </Field>
      <Field label="Reward XP" htmlFor="cx">
        <Input id="cx" type="number" value={f.rewardXp} onChange={(e) => setF({ ...f, rewardXp: Number(e.target.value) })} />
      </Field>
      <Field label="Title template ({target} is substituted)" htmlFor="ctt" className="sm:col-span-2">
        <Input id="ctt" value={f.titleTemplate} onChange={(e) => setF({ ...f, titleTemplate: e.target.value })} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          Add definition
        </Button>
      </div>
    </form>
  );
}

export function AchievementRow({ id, active, xp }: { id: number; active: boolean; xp: number }) {
  const { pending, exec } = useAction();
  const [x, setX] = React.useState(xp);
  return (
    <div className="flex items-center justify-end gap-3">
      <Input aria-label="XP" type="number" className="h-9 w-20" value={x} onChange={(e) => setX(Number(e.target.value))} onBlur={() => x !== xp && exec(() => updateAchievementAction(id, { xp: x }), "XP updated")} />
      <Switch aria-label="Active" checked={active} disabled={pending} onCheckedChange={(v) => exec(() => updateAchievementAction(id, { active: v }), v ? "Enabled" : "Disabled")} />
    </div>
  );
}

export function AchievementForm({ games }: { games: { id: string; title: string }[] }) {
  const { pending, exec } = useAction();
  const [f, setF] = React.useState({ gameId: "", key: "", title: "", description: "", xp: 25, icon: "trophy", ruleType: "score_at_least", value: 1000 });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const rule =
          f.ruleType === "score_at_least"
            ? { type: "score_at_least", leaderboard: "highscore", score: f.value }
            : f.ruleType === "game_reported"
              ? { type: "game_reported", minRunSeconds: f.value }
              : f.ruleType === "level"
                ? { type: "level", level: f.value }
                : { type: f.ruleType, count: f.value };
        exec(() => createAchievementAction({ gameId: f.gameId || null, key: f.key, title: f.title, description: f.description, xp: f.xp, icon: f.icon, rule }), "Achievement created");
      }}
    >
      <Field label="Scope" htmlFor="ag">
        <Select id="ag" value={f.gameId} onChange={(e) => setF({ ...f, gameId: e.target.value })}>
          <option value="">Platform-wide</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rule" htmlFor="ar">
        <Select id="ar" value={f.ruleType} onChange={(e) => setF({ ...f, ruleType: e.target.value })}>
          <option value="score_at_least">Score at least (server-verified)</option>
          <option value="game_reported">Game-reported (min run seconds)</option>
          <option value="runs_completed">Runs completed</option>
          <option value="distinct_games">Distinct games played</option>
          <option value="distinct_days">Distinct days played</option>
          <option value="challenges_completed">Daily challenges completed</option>
          <option value="level">Reach level</option>
        </Select>
      </Field>
      <Field label="Key (SDK id)" htmlFor="ak">
        <Input id="ak" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
      </Field>
      <Field label="Threshold / value" htmlFor="av">
        <Input id="av" type="number" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} />
      </Field>
      <Field label="Title" htmlFor="at">
        <Input id="at" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label="XP" htmlFor="ax">
        <Input id="ax" type="number" value={f.xp} onChange={(e) => setF({ ...f, xp: Number(e.target.value) })} />
      </Field>
      <Field label="Description" htmlFor="ad" className="sm:col-span-2">
        <Textarea id="ad" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          Create achievement
        </Button>
      </div>
    </form>
  );
}

export function PlacementForm({
  placementKey,
  initial,
}: {
  placementKey: string;
  initial: { enabled: boolean; provider: string; clientId: string; slotId: string; frequencyCapSeconds: number };
}) {
  const { pending, exec } = useAction();
  const [f, setF] = React.useState(initial);
  const inGame = placementKey === "interstitial" || placementKey === "rewarded";
  return (
    <form
      className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_120px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => updatePlacementAction(placementKey, f), "Placement saved");
      }}
    >
      <label className="flex items-center gap-2 pb-2.5 text-sm text-fg">
        <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} aria-label="Enabled" /> On
      </label>
      <Field label="Provider" htmlFor={`p-${placementKey}`}>
        <Select id={`p-${placementKey}`} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>
          <option value="none">None</option>
          {inGame ? <option value="h5_games_ads">Google H5 Games Ads</option> : <option value="adsense">Google AdSense</option>}
        </Select>
      </Field>
      <Field label="Publisher id" htmlFor={`c-${placementKey}`}>
        <Input id={`c-${placementKey}`} placeholder="ca-pub-…" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} />
      </Field>
      <Field label="Slot id" htmlFor={`s-${placementKey}`}>
        <Input id={`s-${placementKey}`} value={f.slotId} disabled={inGame} onChange={(e) => setF({ ...f, slotId: e.target.value })} />
      </Field>
      <Field label="Cap (s)" htmlFor={`f-${placementKey}`}>
        <Input id={`f-${placementKey}`} type="number" value={f.frequencyCapSeconds} onChange={(e) => setF({ ...f, frequencyCapSeconds: Number(e.target.value) })} />
      </Field>
      <Button type="submit" size="md" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

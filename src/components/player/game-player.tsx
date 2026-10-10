"use client";

import { AlertTriangle, Expand, Loader2, Minimize, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import type { AdResult, InitResult, Method, ScoreResult } from "@chronoblink/sdk/protocol";
import { useConsent } from "@/components/consent";
import { Button } from "@/components/ui/button";
import { trackPlatformEvent } from "@/lib/analytics-client";
import { getAnonId, getMuted, guestSaveDelete, guestSaveGet, guestSaveSet, pushRecent, setMuted as storeMuted } from "@/lib/local";
import { DEFAULT_BUDGET, MessageBudget, connectMessage, helloSchema, parseRequest } from "@/lib/sdk-host";
import { IFRAME_ALLOW, IFRAME_SANDBOX } from "@/server/game-host-policy";
import { cn } from "@/lib/utils";

export type PlayerGame = {
  id: string;
  slug: string;
  title: string;
  entryUrl: string;
  cover: string | null;
  accentColor: string;
  orientation: "landscape" | "portrait" | "any";
  supportsMobile: boolean;
  leaderboards: string[];
  hasAchievements: boolean;
};

type Phase = "idle" | "starting" | "loading" | "running" | "error";
type Session = { sessionId: string; token: string; player: InitResult["player"] };

const LOAD_TIMEOUT_MS = 45_000;
const HEARTBEAT_MS = 30_000;

function detectDevice(): "desktop" | "mobile" | "tablet" {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

export function GamePlayer({
  game,
  signedIn,
  onScore,
}: {
  game: PlayerGame;
  signedIn: boolean;
  onScore?: (r: ScoreResult) => void;
}) {
  const router = useRouter();
  const { consent } = useConsent();
  const consentRef = React.useRef(consent);
  consentRef.current = consent;

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [frameKey, setFrameKey] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [sdkConnected, setSdkConnected] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState<"off" | "native" | "pseudo">("off");
  const [gameFocused, setGameFocused] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const portRef = React.useRef<MessagePort | null>(null);
  const nonceRef = React.useRef<string | null>(null);
  const sessionRef = React.useRef<Session | null>(null);
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const budgetRef = React.useRef(new MessageBudget(DEFAULT_BUDGET));
  const loadStartRef = React.useRef(0);
  const loadedRef = React.useRef(false);
  const activeRef = React.useRef(0);
  const pausedRef = React.useRef(false);
  const runsRef = React.useRef(0);
  const mutedRef = React.useRef(false);
  const guestNoticeRef = React.useRef(false);

  React.useEffect(() => {
    const m = getMuted();
    // Device preferences are only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(m);
    mutedRef.current = m;
    setIsMobile(detectDevice() !== "desktop");
    if (consentRef.current?.analytics) trackPlatformEvent("game_page_view", game.id);
  }, [game.id]);

  // ── server calls (serialised so run.start → run.end → score arrive in order) ──
  const api = React.useCallback(<T,>(body: Record<string, unknown>, opts?: { keepalive?: boolean }): Promise<T> => {
    const s = sessionRef.current;
    if (!s) return Promise.reject(new Error("no session"));
    const run = () =>
      fetch(`/api/play/sessions/${s.sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-play-token": s.token },
        body: JSON.stringify(body),
        keepalive: opts?.keepalive,
      }).then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
        if (!res.ok) throw Object.assign(new Error(data.error?.message ?? `HTTP ${res.status}`), { code: data.error?.code, status: res.status });
        return data as T;
      });
    const p = queueRef.current.then(run, run);
    queueRef.current = p.catch(() => {});
    return p;
  }, []);

  const sendEvent = React.useCallback((event: "pause" | "resume" | "mute" | "unmute") => {
    try {
      portRef.current?.postMessage({ event });
    } catch {
      /* port closed */
    }
  }, []);

  const flushHeartbeat = React.useCallback(
    (extra?: { ended?: boolean; loadState?: "loaded" | "failed"; loadMs?: number }, keepalive = false) => {
      if (!sessionRef.current) return;
      const seconds = Math.floor(activeRef.current);
      activeRef.current -= seconds;
      if (seconds === 0 && !extra) return;
      void api({ op: "heartbeat", activeSeconds: seconds, ...extra }, { keepalive }).catch(() => {});
    },
    [api],
  );

  // ── SDK request handling ────────────────────────────────────────────────────
  const handleRequest = React.useCallback(
    async (data: unknown) => {
      const port = portRef.current;
      if (!port) return;
      const parsed = parseRequest(data);
      if (!parsed.ok) {
        if (parsed.id !== null) port.postMessage({ id: parsed.id, ok: false, error: { code: parsed.code, message: "Request rejected" } });
        return;
      }
      const { id, method, params } = parsed.req;
      const reply = (result: unknown) => port.postMessage({ id, ok: true, result });
      const fail = (code: string, message = code) => port.postMessage({ id, ok: false, error: { code, message } });
      if (!budgetRef.current.allow(method)) return fail("rate_limited", "Too many SDK calls");

      try {
        switch (method as Method) {
          case "init": {
            setSdkConnected(true);
            const s = sessionRef.current;
            const result: InitResult = {
              platform: "chronoblink",
              player: s?.player ?? { id: null, displayName: "Guest", isGuest: true },
              settings: { muted: mutedRef.current },
              capabilities: {
                leaderboards: game.leaderboards,
                cloudSaves: signedIn,
                achievements: game.hasAchievements,
                ads: { midgame: true, rewarded: true },
                fullscreen: true,
              },
            };
            return reply(result);
          }
          case "loading.progress":
            setProgress((params as { progress: number }).progress);
            return reply(null);
          case "loading.done":
            setProgress(1);
            return reply(null);
          case "gameplay.start":
            runsRef.current++;
            reply(null);
            await api({ op: "run.start" }).catch(() => {});
            return;
          case "gameplay.stop": {
            reply(null);
            const r = await api<{ ended: boolean; unlocked: { title: string; xp: number }[] }>({ op: "run.end" }).catch(() => null);
            r?.unlocked.forEach((a) => toast.success(`Achievement unlocked: ${a.title}`, { description: `+${a.xp} XP` }));
            return;
          }
          case "score.submit": {
            const p = params as { leaderboard: string; score: number };
            const r = await api<ScoreResult>({ op: "score", ...p }).catch((): ScoreResult => ({ accepted: false, reason: "error" }));
            reply(r);
            if (r.accepted) {
              onScore?.(r);
              if (r.rank && r.rank <= 10) toast.success(`You're #${r.rank} on the all-time board!`);
            } else if (r.reason === "guest" && !guestNoticeRef.current) {
              guestNoticeRef.current = true;
              toast("Sign in to post scores and earn XP", {
                action: { label: "Sign in", onClick: () => router.push(`/login?next=/play/${game.slug}`) },
              });
            }
            return;
          }
          case "achievement.unlock": {
            const r = await api<{ unlocked: boolean }>({ op: "achievement", key: (params as { key: string }).key }).catch(() => ({ unlocked: false }));
            return reply(r);
          }
          case "data.save": {
            const p = params as { key: string; value: unknown };
            if (!signedIn) {
              guestSaveSet(game.slug, p.key, p.value);
              return reply({ saved: true, location: "local" });
            }
            await api({ op: "save", ...p });
            return reply({ saved: true, location: "cloud" });
          }
          case "data.load": {
            const p = params as { key: string };
            if (!signedIn) return reply({ value: guestSaveGet(game.slug, p.key) });
            return reply(await api<{ value: unknown }>({ op: "load", key: p.key }));
          }
          case "data.delete": {
            const p = params as { key: string };
            if (!signedIn) {
              guestSaveDelete(game.slug, p.key);
              return reply({ deleted: true });
            }
            return reply(await api<{ deleted: boolean }>({ op: "delete", key: p.key }));
          }
          case "ad.request": {
            const type = (params as { type: "midgame" | "rewarded" }).type;
            type Decision = { allowed: boolean; reason?: string; provider?: string; clientId?: string };
            const decision: Decision = await api<Decision>({
              op: "ad.request",
              type,
              consent: Boolean(consentRef.current?.ads),
            }).catch((): Decision => ({ allowed: false, reason: "error" }));
            if (!decision.allowed) return reply({ shown: false, rewarded: false, reason: decision.reason } satisfies AdResult);
            const { showH5Ad } = await import("@/lib/ad-adapters");
            sendEvent("pause");
            sendEvent("mute");
            const outcome = await showH5Ad({ type, clientId: decision.clientId ?? "", onStart: () => api({ op: "ad.outcome", type, event: "started" }).catch(() => {}) });
            void api({ op: "ad.outcome", type, event: outcome.shown ? "completed" : "failed" }).catch(() => {});
            if (!mutedRef.current) sendEvent("unmute");
            sendEvent("resume");
            return reply(outcome);
          }
          case "fullscreen.request":
            return reply({ fullscreen: await enterFullscreen() });
          case "analytics.track": {
            if (consentRef.current?.analytics) {
              const p = params as { name: string; props?: Record<string, string | number | boolean | null> };
              void api({ op: "events", events: [{ eventId: crypto.randomUUID(), name: `sdk:${p.name}`, props: p.props }] }).catch(() => {});
            }
            return reply(null);
          }
          case "error.report": {
            const p = params as { message: string };
            void api({ op: "events", events: [{ eventId: crypto.randomUUID(), name: "sdk_error", props: { message: p.message } }] }).catch(() => {});
            return reply(null);
          }
        }
      } catch (e) {
        fail("error", e instanceof Error ? e.message : "failed");
      }
    },
    // enterFullscreen is stable enough for this handler's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, game, signedIn, onScore, router, sendEvent],
  );

  // ── handshake: only the iframe we created may connect ───────────────────────
  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const hello = helloSchema.safeParse(e.data);
      if (!hello.success) return;
      if (nonceRef.current === hello.data.nonce) return; // a retried hello for the channel we already opened
      nonceRef.current = hello.data.nonce;
      portRef.current?.close();
      const channel = new MessageChannel();
      channel.port1.onmessage = (ev) => void handleRequest(ev.data);
      portRef.current = channel.port1;
      // The frame's origin is opaque (sandboxed), so "*" is the only possible target;
      // e.source identity above is what authenticates it.
      frame.contentWindow?.postMessage(connectMessage(hello.data.nonce), "*", [channel.port2]);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleRequest]);

  // ── active-time accounting & visibility ────────────────────────────────────
  React.useEffect(() => {
    if (phase !== "running") return;
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus() && !pausedRef.current) activeRef.current += 1;
    }, 1000);
    const beat = setInterval(() => flushHeartbeat(), HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        pausedRef.current = true;
        sendEvent("pause");
        flushHeartbeat(undefined, true);
      } else {
        pausedRef.current = false;
        sendEvent("resume");
      }
    };
    const onHide = () => flushHeartbeat({ ended: true }, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [phase, flushHeartbeat, sendEvent]);

  // End the session when leaving the page (client navigation).
  React.useEffect(() => {
    const runs = runsRef;
    return () => {
      if (!sessionRef.current) return;
      if (runs.current === 0 && loadedRef.current && consentRef.current?.analytics) {
        trackPlatformEvent("session_abandon", game.id);
      }
      flushHeartbeat({ ended: true }, true);
      portRef.current?.close();
      document.documentElement.removeAttribute("data-game-focus");
    };
  }, [flushHeartbeat, game.id]);

  // ── focus: lock page scrolling while the game has keyboard focus ───────────
  React.useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        const inGame = document.activeElement === iframeRef.current;
        setGameFocused(inGame);
        if (inGame) document.documentElement.setAttribute("data-game-focus", "true");
      }, 0);
    };
    const onFocus = () => {
      setGameFocused(false);
      document.documentElement.removeAttribute("data-game-focus");
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ── load timeout ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => {
      if (loadedRef.current) return;
      setPhase("error");
      setError("The game took too long to load. Check your connection and try again.");
      flushHeartbeat({ loadState: "failed" });
      if (consentRef.current?.analytics) trackPlatformEvent("game_load_error", game.id, { reason: "timeout" });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, frameKey, flushHeartbeat, game.id]);

  // ── fullscreen ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onChange = () => setFullscreen((f) => (document.fullscreenElement ? "native" : f === "pseudo" ? "pseudo" : "off"));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  React.useEffect(() => {
    if (fullscreen !== "pseudo") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen("off");
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [fullscreen]);

  async function enterFullscreen(): Promise<boolean> {
    const el = wrapperRef.current;
    if (!el) return false;
    if (document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: "hide" });
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (isMobile && game.orientation !== "any" && orientation?.lock) {
          await orientation.lock(game.orientation === "portrait" ? "portrait" : "landscape").catch(() => {});
        }
        iframeRef.current?.focus();
        return true;
      } catch {
        /* fall through to pseudo fullscreen */
      }
    }
    setFullscreen("pseudo");
    iframeRef.current?.focus();
    return true;
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else if (fullscreen === "pseudo") setFullscreen("off");
    else await enterFullscreen();
  }

  // ── lifecycle actions ──────────────────────────────────────────────────────
  async function start() {
    setPhase("starting");
    setError(null);
    pushRecent(game.slug);
    try {
      const res = await fetch("/api/play/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: game.slug, device: detectDevice(), anonId: getAnonId(Boolean(consentRef.current?.analytics)) }),
      });
      const data = (await res.json()) as Session & { error?: { message: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "Couldn't start the game");
      sessionRef.current = { sessionId: data.sessionId, token: data.token, player: data.player };
      loadedRef.current = false;
      loadStartRef.current = performance.now();
      setProgress(null);
      setPhase("loading");
      if (consentRef.current?.analytics) trackPlatformEvent("game_load_start", game.id);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Couldn't start the game");
    }
  }

  function onFrameLoad() {
    if (!sessionRef.current || loadedRef.current) return;
    loadedRef.current = true;
    const loadMs = Math.round(performance.now() - loadStartRef.current);
    setPhase("running");
    flushHeartbeat({ loadState: "loaded", loadMs });
    if (consentRef.current?.analytics) trackPlatformEvent("game_load_success", game.id, { loadMs });
    iframeRef.current?.focus();
  }

  function restart() {
    portRef.current?.close();
    portRef.current = null;
    nonceRef.current = null;
    setSdkConnected(false);
    loadedRef.current = false;
    loadStartRef.current = performance.now();
    setProgress(null);
    setFrameKey((k) => k + 1);
    setPhase("loading");
  }

  async function retry() {
    if (sessionRef.current) restart();
    else await start();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    storeMuted(next);
    sendEvent(next ? "mute" : "unmute");
  }

  const portrait = game.orientation === "portrait";
  const showFrame = phase === "loading" || phase === "running";
  const fsActive = fullscreen !== "off";

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(e.key)) e.preventDefault();
        }}
        className={cn(
          "relative overflow-hidden bg-black outline-none",
          fullscreen === "pseudo" ? "fixed inset-0 z-[70] rounded-none" : "rounded-2xl border border-line shadow-[var(--shadow-lift)]",
          fullscreen === "native" && "rounded-none border-0",
          !fsActive && (portrait ? "mx-auto aspect-[9/16] max-h-[78dvh] w-full max-w-[min(100%,calc(78dvh*9/16))]" : "aspect-[4/5] w-full min-[480px]:aspect-video max-h-[80dvh]"),
        )}
        data-testid="game-viewport"
      >
        {showFrame && sessionRef.current ? (
          <iframe
            key={frameKey}
            ref={iframeRef}
            src={game.entryUrl}
            title={`${game.title} game`}
            sandbox={IFRAME_SANDBOX}
            allow={IFRAME_ALLOW}
            referrerPolicy="no-referrer"
            loading="eager"
            onLoad={onFrameLoad}
            className={cn("absolute inset-0 size-full border-0 transition-opacity duration-300", phase === "running" ? "opacity-100" : "opacity-0")}
            data-testid="game-frame"
          />
        ) : null}

        {phase === "idle" || phase === "starting" ? (
          <div className="absolute inset-0">
            {game.cover ? <Image src={game.cover} alt="" fill priority sizes="(min-width: 1024px) 70vw, 100vw" className="object-cover opacity-60" /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-display text-2xl font-extrabold text-white drop-shadow sm:text-4xl">{game.title}</h2>
              <Button size="lg" onClick={start} disabled={phase === "starting"} className="h-14 px-9 text-base" data-testid="play-button" autoFocus>
                {phase === "starting" ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
                {phase === "starting" ? "Starting…" : "Play now"}
              </Button>
              {isMobile && !game.supportsMobile ? (
                <p className="max-w-xs rounded-xl bg-warning/15 px-3 py-2 text-xs font-semibold text-warning">
                  This game is designed for keyboard and mouse and may not work well on touch screens.
                </p>
              ) : (
                <p className="text-xs text-white/60">Free · No download{signedIn ? "" : " · No account needed"}</p>
              )}
            </div>
          </div>
        ) : null}

        {phase === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-semibold text-fg-muted">Loading {game.title}…</p>
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-raised">
              {progress === null ? (
                <div className="skeleton h-full w-full" />
              ) : (
                <div className="h-full bg-gradient-to-r from-primary to-electric transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              )}
            </div>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink p-6 text-center" role="alert">
            <AlertTriangle className="size-9 text-warning" />
            <div>
              <p className="font-display text-lg font-bold text-fg">Something went wrong</p>
              <p className="mt-1 max-w-sm text-sm text-fg-muted">{error}</p>
            </div>
            <Button onClick={retry} variant="secondary">
              <RotateCcw /> Try again
            </Button>
          </div>
        ) : null}

        {fsActive ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-ink/60 text-white/80 opacity-60 backdrop-blur transition hover:opacity-100"
            aria-label="Exit fullscreen"
          >
            <Minimize className="size-5" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1" role="toolbar" aria-label="Game controls">
        <ToolbarButton label="Restart game" onClick={restart} disabled={!showFrame}>
          <RotateCcw className="size-5" />
        </ToolbarButton>
        <ToolbarButton
          label={!sdkConnected ? "Mute (needs game support)" : muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          disabled={phase === "running" && !sdkConnected}
          pressed={muted}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </ToolbarButton>
        <ToolbarButton label="Fullscreen" onClick={toggleFullscreen} disabled={!showFrame}>
          <Expand className="size-5" />
        </ToolbarButton>
        <span className="ml-2 hidden text-xs text-fg-subtle sm:inline">
          {phase === "running"
            ? gameFocused
              ? "Game has keyboard focus · Esc exits fullscreen"
              : "Click the game to give it keyboard focus"
            : null}
        </span>
        {phase === "running" && !signedIn ? (
          <Link href={`/login?next=/play/${game.slug}`} className="ml-auto text-xs font-semibold text-electric hover:underline">
            Sign in to save scores & XP
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

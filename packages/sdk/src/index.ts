/**
 * @chronoblink/sdk — integrate an HTML5 game with ChronoBlink Arcade.
 *
 *   import { ChronoBlink } from "@chronoblink/sdk";
 *   await ChronoBlink.init();
 *   ChronoBlink.gameplayStart();
 *   await ChronoBlink.submitScore({ leaderboard: "highscore", score: 12500 });
 *
 * Or without a bundler: <script src="/sdk/v1/chronoblink.js"></script> and use
 * the global `window.ChronoBlink`.
 *
 * Every method is safe to call outside ChronoBlink (file://, itch.io, your own
 * site): the SDK falls back to a standalone mode where saves use localStorage
 * when available and score/ad calls resolve with `reason: "standalone"`.
 */
import {
  LIMITS,
  MESSAGE_TAG,
  PROTOCOL_VERSION,
  SDK_VERSION,
  type AdResult,
  type AdType,
  type AnalyticsProps,
  type Capabilities,
  type ConnectMessage,
  type EventMessage,
  type InitResult,
  type Method,
  type MethodMap,
  type PlatformEvent,
  type Player,
  type ResponseMessage,
  type ScoreResult,
  type Settings,
} from "./protocol";

export type { AdResult, AdType, AnalyticsProps, Capabilities, InitResult, PlatformEvent, Player, ScoreResult, Settings };
export { SDK_VERSION, PROTOCOL_VERSION };

type Handler = (data?: unknown) => void;

const HANDSHAKE_TIMEOUT_MS = 3000;
const REQUEST_TIMEOUT_MS = 15000;
const STANDALONE_PLAYER: Player = { id: null, displayName: "Player", isGuest: true };
const STANDALONE_CAPS: Capabilities = {
  leaderboards: [],
  cloudSaves: false,
  achievements: false,
  ads: { midgame: false, rewarded: false },
  fullscreen: true,
};

function randomNonce(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && "getRandomValues" in c) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function inFrame(): boolean {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return true;
  }
}

function safeLocal(): Storage | null {
  try {
    const s = window.localStorage;
    const k = "__cbsdk_probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ChronoBlinkSDK {
  private port: MessagePort | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private handlers = new Map<PlatformEvent, Set<Handler>>();
  private initPromise: Promise<InitResult> | null = null;
  private memory = new Map<string, string>();
  private playing = false;
  private state: InitResult | null = null;

  /** Connects to the platform (or falls back to standalone mode). Idempotent. */
  init(): Promise<InitResult> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  /** True when running outside ChronoBlink (or before init resolved). */
  get isStandalone(): boolean {
    return this.port === null;
  }
  get player(): Player {
    return this.state?.player ?? STANDALONE_PLAYER;
  }
  get settings(): Settings {
    return this.state?.settings ?? { muted: false };
  }
  get capabilities(): Capabilities {
    return this.state?.capabilities ?? STANDALONE_CAPS;
  }

  async getPlayer(): Promise<Player> {
    await this.init();
    return this.player;
  }
  async isGuest(): Promise<boolean> {
    return (await this.getPlayer()).isGuest;
  }

  loadingProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    this.fire("loading.progress", { progress: p });
  }
  loadingDone(): void {
    this.fire("loading.done", {});
  }

  /** Call when a run actually starts. The platform times runs server-side. */
  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.fire("gameplay.start", {});
  }
  /** Call on game over, pause-to-menu or quit. */
  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.fire("gameplay.stop", {});
  }

  /** Submit the score of the current (or just-finished) run. One submission per run and leaderboard. */
  async submitScore(input: { leaderboard: string; score: number }): Promise<ScoreResult> {
    const score = Math.floor(Number(input?.score));
    const leaderboard = String(input?.leaderboard ?? "");
    if (!Number.isFinite(score) || score < 0 || score > LIMITS.maxScore || !LIMITS.leaderboardKeyPattern.test(leaderboard)) {
      return { accepted: false, reason: "rejected" };
    }
    await this.init();
    if (!this.port) return { accepted: false, reason: "standalone" };
    return this.call("score.submit", { leaderboard, score }).catch((): ScoreResult => ({ accepted: false, reason: "error" }));
  }

  async unlockAchievement(key: string): Promise<{ unlocked: boolean }> {
    if (!LIMITS.achievementKeyPattern.test(String(key))) return { unlocked: false };
    await this.init();
    if (!this.port) return { unlocked: false };
    return this.call("achievement.unlock", { key: String(key) }).catch(() => ({ unlocked: false }));
  }

  /** Save small JSON data (≤ 16 KB). Cloud for signed-in players, device-local for guests. */
  async saveData(key: string, value: unknown): Promise<boolean> {
    if (!LIMITS.saveKeyPattern.test(String(key))) throw new Error("ChronoBlink.saveData: invalid key");
    const json = JSON.stringify(value === undefined ? null : value);
    if (json.length > LIMITS.saveMaxBytes) throw new Error("ChronoBlink.saveData: value exceeds 16 KB");
    await this.init();
    if (!this.port) return this.localSet(key, json);
    try {
      const r = await this.call("data.save", { key, value: JSON.parse(json) as unknown });
      return r.saved;
    } catch {
      return false;
    }
  }

  async loadData<T = unknown>(key: string): Promise<T | null> {
    if (!LIMITS.saveKeyPattern.test(String(key))) return null;
    await this.init();
    if (!this.port) {
      const raw = this.localGet(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    try {
      const r = await this.call("data.load", { key });
      return (r.value ?? null) as T | null;
    } catch {
      return null;
    }
  }

  async deleteData(key: string): Promise<boolean> {
    if (!LIMITS.saveKeyPattern.test(String(key))) return false;
    await this.init();
    if (!this.port) {
      this.memory.delete(key);
      try {
        window.localStorage.removeItem(this.localKey(key));
      } catch {
        /* storage unavailable */
      }
      return true;
    }
    return this.call("data.delete", { key })
      .then((r) => r.deleted)
      .catch(() => false);
  }

  /**
   * Ask for an ad at a natural break. Resolves when the ad finished or failed;
   * the platform sends `pause`/`resume` around it. `rewarded` is only true when
   * the ad provider confirmed completion — never grant rewards otherwise.
   */
  async requestAd(type: AdType): Promise<AdResult> {
    await this.init();
    if (!this.port) return { shown: false, rewarded: false, reason: "standalone" };
    return this.call("ad.request", { type }, 120_000).catch(() => ({ shown: false, rewarded: false, reason: "error" }));
  }

  async requestFullscreen(): Promise<boolean> {
    await this.init();
    if (!this.port) {
      try {
        await document.documentElement.requestFullscreen();
        return true;
      } catch {
        return false;
      }
    }
    return this.call("fullscreen.request", {})
      .then((r) => r.fullscreen)
      .catch(() => false);
  }

  track(name: string, props?: AnalyticsProps): void {
    if (!LIMITS.eventNamePattern.test(String(name))) return;
    this.fire("analytics.track", { name, props });
  }

  reportError(error: unknown): void {
    const e = error instanceof Error ? error : new Error(String(error));
    this.fire("error.report", { message: e.message.slice(0, 500), stack: e.stack?.slice(0, 2000) });
  }

  on(event: PlatformEvent, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }
  off(event: PlatformEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async doInit(): Promise<InitResult> {
    if (typeof window === "undefined" || !inFrame()) return this.standalone();
    const port = await this.handshake();
    if (!port) return this.standalone();
    this.port = port;
    port.onmessage = (e: MessageEvent) => this.onPortMessage(e.data);
    port.start();
    try {
      const res = await this.call("init", { sdkVersion: SDK_VERSION });
      this.state = res;
      if (res.settings.muted) this.emit("mute");
      return res;
    } catch {
      this.port = null;
      return this.standalone();
    }
  }

  private standalone(): InitResult {
    this.state = { platform: "standalone", player: STANDALONE_PLAYER, settings: { muted: false }, capabilities: STANDALONE_CAPS };
    return this.state;
  }

  private handshake(): Promise<MessagePort | null> {
    return new Promise((resolve) => {
      const nonce = randomNonce();
      let done = false;
      let tries = 0;
      const onMessage = (e: MessageEvent) => {
        if (e.source !== window.parent) return;
        const d = e.data as Partial<ConnectMessage> | null;
        if (!d || d.cbsdk !== 1 || d.kind !== "connect" || d.nonce !== nonce || d.protocol !== PROTOCOL_VERSION) return;
        const port = e.ports[0];
        if (port) finish(port);
      };
      const hello = () => {
        tries++;
        try {
          window.parent.postMessage({ [MESSAGE_TAG]: 1, kind: "hello", sdkVersion: SDK_VERSION, nonce }, "*");
        } catch {
          finish(null);
        }
      };
      window.addEventListener("message", onMessage);
      const retry = setInterval(() => {
        if (tries < 6) hello();
      }, 400);
      const timeout = setTimeout(() => finish(null), HANDSHAKE_TIMEOUT_MS);
      function finish(port: MessagePort | null) {
        if (done) return;
        done = true;
        clearInterval(retry);
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(port);
      }
      hello();
    });
  }

  private onPortMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as Partial<EventMessage> & { id?: unknown };
    if (typeof msg.event === "string") {
      const ev = msg.event;
      if (ev === "pause" || ev === "resume" || ev === "mute" || ev === "unmute") {
        if (this.state && (ev === "mute" || ev === "unmute")) this.state.settings.muted = ev === "mute";
        this.emit(ev, msg.data);
      }
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    const r = data as ResponseMessage;
    if (r.ok) p.resolve(r.result);
    else p.reject(new Error(`${r.error?.code ?? "error"}: ${r.error?.message ?? "request failed"}`));
  }

  private emit(event: PlatformEvent, data?: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(data);
      } catch (err) {
        console.error("[ChronoBlink] event handler failed", err);
      }
    });
  }

  private call<M extends Method>(method: M, params: MethodMap[M][0], timeoutMs = REQUEST_TIMEOUT_MS): Promise<MethodMap[M][1]> {
    const port = this.port;
    if (!port) return Promise.reject(new Error("not connected"));
    const id = ++this.seq;
    return new Promise<MethodMap[M][1]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      port.postMessage({ id, method, params });
    });
  }

  /** Fire-and-forget; waits for init so early calls aren't lost. */
  private fire<M extends Method>(method: M, params: MethodMap[M][0]): void {
    void this.init().then(() => {
      if (this.port) this.call(method, params).catch(() => {});
    });
  }

  private localKey(key: string): string {
    let scope = "game";
    try {
      scope = location.pathname.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 80) || "game";
    } catch {
      /* ignore */
    }
    return `cbsdk:${scope}:${key}`;
  }
  private localGet(key: string): string | null {
    const s = safeLocal();
    if (s) return s.getItem(this.localKey(key));
    return this.memory.get(key) ?? null;
  }
  private localSet(key: string, json: string): boolean {
    const s = safeLocal();
    if (s) {
      try {
        s.setItem(this.localKey(key), json);
        return true;
      } catch {
        /* quota exceeded — fall through to memory */
      }
    }
    this.memory.set(key, json);
    return true;
  }
}

export const ChronoBlink = new ChronoBlinkSDK();
export default ChronoBlink;

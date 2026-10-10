/**
 * ChronoBlink SDK wire protocol, version 1.
 *
 * Handshake (window.postMessage — the only step that uses it):
 *   game → parent   { cbsdk: 1, kind: "hello", sdkVersion, nonce }
 *   parent → game   { cbsdk: 1, kind: "connect", protocol: 1, nonce }  + transferred MessagePort
 *
 * The game runs in a sandboxed iframe with an opaque origin, so neither side can
 * name the other's origin. The parent authenticates the sender by checking
 * `event.source === iframe.contentWindow`; the game checks
 * `event.source === window.parent` and the echoed nonce. All further traffic
 * goes over the private MessagePort, which no other frame can observe.
 *
 * Over the port:
 *   request   { id, method, params }
 *   response  { id, ok: true, result } | { id, ok: false, error: { code, message } }
 *   event     { event, data? }   (platform → game only)
 */
export const PROTOCOL_VERSION = 1 as const;
export const SDK_VERSION = "1.0.0";
export const MESSAGE_TAG = "cbsdk" as const;

export type HelloMessage = { cbsdk: 1; kind: "hello"; sdkVersion: string; nonce: string };
export type ConnectMessage = { cbsdk: 1; kind: "connect"; protocol: 1; nonce: string };

export type Player = { id: string | null; displayName: string; isGuest: boolean };
export type Settings = { muted: boolean };
export type Capabilities = {
  leaderboards: string[];
  cloudSaves: boolean;
  achievements: boolean;
  ads: { midgame: boolean; rewarded: boolean };
  fullscreen: boolean;
};

export type InitResult = {
  platform: "chronoblink" | "standalone";
  player: Player;
  settings: Settings;
  capabilities: Capabilities;
};

export type ScoreReason =
  | "guest"
  | "standalone"
  | "no_run"
  | "rejected"
  | "rate_limited"
  | "unknown_leaderboard"
  | "error";

export type ScoreResult = {
  accepted: boolean;
  provisional?: boolean;
  best?: number;
  rank?: number;
  reason?: ScoreReason;
};

export type AdType = "midgame" | "rewarded";
export type AdResult = { shown: boolean; rewarded: boolean; reason?: string };

export type AnalyticsProps = Record<string, string | number | boolean | null>;

/** Method name → [params, result]. */
export interface MethodMap {
  init: [{ sdkVersion: string }, InitResult];
  "loading.progress": [{ progress: number }, null];
  "loading.done": [Record<string, never>, null];
  "gameplay.start": [Record<string, never>, null];
  "gameplay.stop": [Record<string, never>, null];
  "score.submit": [{ leaderboard: string; score: number }, ScoreResult];
  "achievement.unlock": [{ key: string }, { unlocked: boolean }];
  "data.save": [{ key: string; value: unknown }, { saved: boolean; location: "cloud" | "local" }];
  "data.load": [{ key: string }, { value: unknown }];
  "data.delete": [{ key: string }, { deleted: boolean }];
  "ad.request": [{ type: AdType }, AdResult];
  "fullscreen.request": [Record<string, never>, { fullscreen: boolean }];
  "analytics.track": [{ name: string; props?: AnalyticsProps }, null];
  "error.report": [{ message: string; stack?: string }, null];
}
export type Method = keyof MethodMap;
export const METHODS: readonly Method[] = [
  "init",
  "loading.progress",
  "loading.done",
  "gameplay.start",
  "gameplay.stop",
  "score.submit",
  "achievement.unlock",
  "data.save",
  "data.load",
  "data.delete",
  "ad.request",
  "fullscreen.request",
  "analytics.track",
  "error.report",
];

export type RequestMessage<M extends Method = Method> = { id: number; method: M; params: MethodMap[M][0] };
export type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { code: string; message: string } };

export type PlatformEvent = "pause" | "resume" | "mute" | "unmute";
export type EventMessage = { event: PlatformEvent; data?: unknown };

export const LIMITS = {
  saveKeyPattern: /^[A-Za-z0-9_.-]{1,64}$/,
  saveMaxBytes: 16 * 1024,
  leaderboardKeyPattern: /^[a-z0-9_-]{1,32}$/,
  achievementKeyPattern: /^[a-z0-9_-]{1,48}$/,
  eventNamePattern: /^[a-z0-9_.:-]{1,48}$/,
  maxScore: 2_000_000_000,
} as const;

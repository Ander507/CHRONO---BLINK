// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ChronoBlinkSDK } from "@chronoblink/sdk";

describe("@chronoblink/sdk standalone mode", () => {
  beforeEach(() => localStorage.clear());

  it("initialises standalone outside an iframe", async () => {
    const sdk = new ChronoBlinkSDK();
    const r = await sdk.init();
    expect(r.platform).toBe("standalone");
    expect(r.player.isGuest).toBe(true);
    expect(sdk.isStandalone).toBe(true);
    expect(await sdk.init()).toBe(r); // idempotent
  });

  it("persists saves to localStorage", async () => {
    const sdk = new ChronoBlinkSDK();
    expect(await sdk.saveData("progress", { level: 5 })).toBe(true);
    expect(await sdk.loadData("progress")).toEqual({ level: 5 });
    expect(await new ChronoBlinkSDK().loadData("progress")).toEqual({ level: 5 });
    await sdk.deleteData("progress");
    expect(await sdk.loadData("progress")).toBeNull();
  });

  it("validates inputs before doing anything", async () => {
    const sdk = new ChronoBlinkSDK();
    await expect(sdk.saveData("bad key!", 1)).rejects.toThrow(/invalid key/);
    await expect(sdk.saveData("k", "x".repeat(20_000))).rejects.toThrow(/16 KB/);
    expect(await sdk.submitScore({ leaderboard: "highscore", score: -1 })).toEqual({ accepted: false, reason: "rejected" });
    expect(await sdk.submitScore({ leaderboard: "highscore", score: Number.NaN })).toEqual({ accepted: false, reason: "rejected" });
    expect(await sdk.submitScore({ leaderboard: "../x", score: 1 })).toEqual({ accepted: false, reason: "rejected" });
    expect(await sdk.unlockAchievement("Not Valid")).toEqual({ unlocked: false });
  });

  it("resolves platform-only features gracefully", async () => {
    const sdk = new ChronoBlinkSDK();
    expect(await sdk.submitScore({ leaderboard: "highscore", score: 100 })).toEqual({ accepted: false, reason: "standalone" });
    expect(await sdk.requestAd("rewarded")).toEqual({ shown: false, rewarded: false, reason: "standalone" });
    expect(await sdk.unlockAchievement("first_win")).toEqual({ unlocked: false });
    expect(() => {
      sdk.gameplayStart();
      sdk.gameplayStop();
      sdk.track("level_up", { level: 2 });
      sdk.reportError(new Error("x"));
    }).not.toThrow();
  });

  it("delivers and unsubscribes event handlers", () => {
    const sdk = new ChronoBlinkSDK();
    let n = 0;
    const off = sdk.on("pause", () => n++);
    (sdk as unknown as { emit: (e: string) => void }).emit("pause");
    off();
    (sdk as unknown as { emit: (e: string) => void }).emit("pause");
    expect(n).toBe(1);
  });
});

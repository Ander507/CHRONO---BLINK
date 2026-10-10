import { describe, expect, it } from "vitest";
import { MessageBudget, connectMessage, helloSchema, parseRequest } from "@/lib/sdk-host";

describe("SDK message validation (platform side)", () => {
  it("accepts well-formed requests", () => {
    const r = parseRequest({ id: 1, method: "score.submit", params: { leaderboard: "highscore", score: 10 } });
    expect(r.ok).toBe(true);
  });

  it.each([
    [null, "malformed"],
    ["string", "malformed"],
    [{ method: "init" }, "malformed"],
    [{ id: -1, method: "init", params: {} }, "malformed"],
    [{ id: 1.5, method: "init", params: {} }, "malformed"],
    [{ id: 1, method: "eval", params: {} }, "unknown_method"],
    [{ id: 1, method: "__proto__", params: {} }, "unknown_method"],
    [{ id: 1, method: "score.submit", params: { leaderboard: "highscore", score: -5 } }, "invalid_params"],
    [{ id: 1, method: "score.submit", params: { leaderboard: "highscore", score: 1.5 } }, "invalid_params"],
    [{ id: 1, method: "score.submit", params: { leaderboard: "HIGH SCORE", score: 1 } }, "invalid_params"],
    [{ id: 1, method: "score.submit", params: { leaderboard: "highscore", score: "9999" } }, "invalid_params"],
    [{ id: 1, method: "data.save", params: { key: "../x", value: 1 } }, "invalid_params"],
    [{ id: 1, method: "gameplay.start", params: { extra: true } }, "invalid_params"],
    [{ id: 1, method: "ad.request", params: { type: "popup" } }, "invalid_params"],
  ])("rejects %j", (data, code) => {
    const r = parseRequest(data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it("rejects oversized save payloads", () => {
    const r = parseRequest({ id: 2, method: "data.save", params: { key: "k", value: "x".repeat(17 * 1024) } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("too_large");
  });

  it("validates the hello handshake shape", () => {
    expect(helloSchema.safeParse({ cbsdk: 1, kind: "hello", sdkVersion: "1.0.0", nonce: "abcdef0123456789" }).success).toBe(true);
    expect(helloSchema.safeParse({ cbsdk: 1, kind: "hello", sdkVersion: "1.0.0", nonce: "short" }).success).toBe(false);
    expect(helloSchema.safeParse({ cbsdk: 2, kind: "hello", sdkVersion: "1", nonce: "abcdef0123456789" }).success).toBe(false);
    expect(connectMessage("n").protocol).toBe(1);
  });

  it("rate-limits per method and globally", () => {
    const b = new MessageBudget({ "*": [5, 1000], "score.submit": [2, 1000] });
    expect(b.allow("score.submit", 0)).toBe(true);
    expect(b.allow("score.submit", 1)).toBe(true);
    expect(b.allow("score.submit", 2)).toBe(false);
    expect(b.allow("init", 3)).toBe(true);
    expect(b.allow("init", 4)).toBe(true);
    expect(b.allow("init", 5)).toBe(false);
    expect(b.allow("init", 1500)).toBe(true);
  });
});

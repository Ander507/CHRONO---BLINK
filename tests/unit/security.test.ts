import { describe, expect, it } from "vitest";
import { IFRAME_SANDBOX, gameCsp, gameResponseHeaders, safeGamePath } from "@/server/game-host-policy";
import { readToken, signToken } from "@/server/storage/driver";
import { safeRedirect } from "@/lib/validation";
import { hasRole } from "@/server/session";

describe("game origin policy", () => {
  it("never grants allow-same-origin to game frames", () => {
    expect(IFRAME_SANDBOX).toContain("allow-scripts");
    expect(IFRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(IFRAME_SANDBOX).not.toContain("allow-top-navigation");
    expect(IFRAME_SANDBOX).not.toContain("allow-popups");
    expect(IFRAME_SANDBOX).not.toContain("allow-forms");
  });

  it("builds a CSP that only the app may frame and that sandboxes the document", () => {
    const csp = gameCsp({ appOrigin: "https://www.chronoblink.xyz", gameOrigin: "https://play.example.net" });
    expect(csp).toContain("frame-ancestors https://www.chronoblink.xyz");
    expect(csp).toContain("sandbox allow-scripts allow-pointer-lock");
    expect(csp).toMatch(/connect-src 'self' https:\/\/play\.example\.net data: blob:;/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("only accepts https extra origins", () => {
    const csp = gameCsp({
      appOrigin: "https://a.test",
      gameOrigin: "https://g.test",
      extraOrigins: ["https://fonts.gstatic.com", "http://evil.test", "https://x.test/path", "*", "javascript:alert(1)"],
    });
    expect(csp).toContain("https://fonts.gstatic.com");
    expect(csp).not.toContain("evil.test");
    expect(csp).not.toContain("/path");
    expect(csp).not.toContain("javascript");
  });

  it("adds CSP to HTML and SVG but not to scripts, and marks published builds immutable", () => {
    const html = gameResponseHeaders({ appOrigin: "https://a.test", gameOrigin: "https://g.test", contentType: "text/html; charset=utf-8", immutable: true });
    expect(html["content-security-policy"]).toBeDefined();
    expect(html["cache-control"]).toContain("immutable");
    expect(html["x-content-type-options"]).toBe("nosniff");
    const svg = gameResponseHeaders({ appOrigin: "https://a.test", gameOrigin: "https://g.test", contentType: "image/svg+xml", immutable: false });
    expect(svg["content-security-policy"]).toBeDefined();
    expect(svg["cache-control"]).toBe("no-store");
    const js = gameResponseHeaders({ appOrigin: "https://a.test", gameOrigin: "https://g.test", contentType: "text/javascript", immutable: true });
    expect(js["content-security-policy"]).toBeUndefined();
  });

  it("normalises request paths and blocks traversal and metadata", () => {
    expect(safeGamePath([])).toBe("index.html");
    expect(safeGamePath(["js", "a.js"])).toBe("js/a.js");
    expect(safeGamePath([".."])).toBeNull();
    expect(safeGamePath(["%2e%2e", "x"])).toBeNull();
    expect(safeGamePath(["a%2fb"])).toBeNull();
    expect(safeGamePath(["a%5cb"])).toBeNull();
    expect(safeGamePath(["%00"])).toBeNull();
    expect(safeGamePath([".chronoblink.json"])).toBeNull();
    expect(safeGamePath(["%E0%A4%A"])).toBeNull();
  });
});

describe("signed tokens", () => {
  const secret = "test-secret-that-is-long-enough";
  it("round-trips and rejects tampering, wrong secrets and expiry", () => {
    const t = signToken(secret, { g: "a", exp: Math.floor(Date.now() / 1000) + 60 });
    expect(readToken<{ g: string; exp: number }>(secret, t)?.g).toBe("a");
    expect(readToken(secret + "x", t)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ g: "b", exp: 9e9 })).toString("base64url");
    expect(readToken(secret, `${forged}.${sig}`)).toBeNull();
    expect(readToken(secret, `${body}.`)).toBeNull();
    expect(readToken(secret, signToken(secret, { exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });
});

describe("safeRedirect", () => {
  it.each([
    ["/play/x", "/play/x"],
    ["/a?b=1#c", "/a?b=1#c"],
    ["https://evil.test", "/"],
    ["//evil.test/x", "/"],
    ["/\\evil.test", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
  ])("%s → %s", (input, out) => {
    expect(safeRedirect(input as string | null)).toBe(out);
  });
});

describe("roles", () => {
  const u = (role: "user" | "developer" | "moderator" | "admin") => ({ id: "1", email: "", name: "", username: null, image: null, emailVerified: true, role });
  it("ranks roles", () => {
    expect(hasRole(u("admin"), "moderator")).toBe(true);
    expect(hasRole(u("moderator"), "admin")).toBe(false);
    expect(hasRole(u("developer"), "moderator")).toBe(false);
    expect(hasRole(null, "user")).toBe(false);
  });
});

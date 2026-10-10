import { describe, expect, it } from "vitest";
import { DEFAULT_ZIP_LIMITS, checkEntryPath, validateZip } from "@/server/uploads/zip-validator";
import { VALID_INDEX, makeZip } from "../support/zip";

describe("validateZip", () => {
  it("accepts a well-formed build and extracts its files", async () => {
    const r = await validateZip(
      makeZip([
        { name: "index.html", data: VALID_INDEX },
        { name: "js/game.js", data: "console.log(1)", deflate: true },
        { name: "assets/sprite.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      ]),
    );
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.files.map((f) => f.path).sort()).toEqual(["assets/sprite.png", "index.html", "js/game.js"]);
    expect(r.files.find((f) => f.path === "js/game.js")!.data.toString()).toBe("console.log(1)");
  });

  it("flattens a single wrapping folder", async () => {
    const r = await validateZip(makeZip([{ name: "my-game/index.html", data: VALID_INDEX }, { name: "my-game/a.js", data: "1" }]));
    expect(r.ok).toBe(true);
    expect(r.files.map((f) => f.path).sort()).toEqual(["a.js", "index.html"]);
  });

  it("requires index.html at the root", async () => {
    const r = await validateZip(makeZip([{ name: "game.js", data: "1" }]));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/index\.html/);
  });

  it.each([
    ["../evil.js", "parent"],
    ["a/../../evil.js", "parent"],
    ["/etc/passwd.txt", "absolute"],
    ["C:/win.js", "absolute"],
    ["a\\b.js", "backslash"],
  ])("rejects path traversal entry %s", async (name) => {
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name, data: "x" }]));
    expect(r.ok).toBe(false);
    expect(r.files).toEqual([]);
  });

  it("rejects symbolic links", async () => {
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: "link.js", data: "/etc/passwd", mode: 0o120777 }]));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/symbolic link/);
  });

  it("rejects disallowed file types", async () => {
    for (const name of ["server.php", "run.exe", "x.sh", "noext"]) {
      const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name, data: "x" }]));
      expect(r.ok, name).toBe(false);
    }
  });

  it("rejects encrypted entries", async () => {
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: "a.js", data: "x", encrypted: true }]));
    expect(r.ok).toBe(false);
  });

  it("rejects the reserved metadata file name", async () => {
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: ".chronoblink.json", data: "{}" }]));
    expect(r.ok).toBe(false);
  });

  it("rejects case-insensitive duplicates", async () => {
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: "A.js", data: "1" }, { name: "a.js", data: "2" }]));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/duplicate/);
  });

  it("detects a high-ratio zip bomb", async () => {
    const bomb = Buffer.alloc(20 * 1024 * 1024); // 20 MB of zeros → ~20 KB deflated
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: "bomb.bin", data: bomb, deflate: true }]));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/zip bomb|ratio/);
  });

  it("enforces actual inflated size even when headers lie", async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 7);
    const r = await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, { name: "liar.bin", data: big, deflate: true, fakeSize: 10 }]), {
      ...DEFAULT_ZIP_LIMITS,
      maxRatio: 1_000_000,
    });
    expect(r.ok).toBe(false);
  });

  it("enforces the total unpacked size", async () => {
    const r = await validateZip(
      makeZip([
        { name: "index.html", data: VALID_INDEX },
        { name: "a.bin", data: Buffer.alloc(600 * 1024, 1) },
        { name: "b.bin", data: Buffer.alloc(600 * 1024, 2) },
      ]),
      { ...DEFAULT_ZIP_LIMITS, maxTotalBytes: 1024 * 1024 },
    );
    expect(r.ok).toBe(false);
  });

  it("enforces the entry count and compressed size", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.js`, data: "1" }));
    expect((await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }, ...many]), { ...DEFAULT_ZIP_LIMITS, maxEntries: 10 })).ok).toBe(false);
    expect((await validateZip(makeZip([{ name: "index.html", data: VALID_INDEX }]), { ...DEFAULT_ZIP_LIMITS, maxCompressedBytes: 10 })).ok).toBe(false);
  });

  it("rejects non-zip input", async () => {
    expect((await validateZip(Buffer.from("<html>not a zip</html>"))).ok).toBe(false);
  });

  it("warns when the SDK isn't referenced", async () => {
    const r = await validateZip(makeZip([{ name: "index.html", data: "<html><body>hi</body></html>" }]));
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/SDK/);
  });
});

describe("checkEntryPath", () => {
  it("allows normal relative paths", () => {
    expect(checkEntryPath("assets/img/a.png")).toBeNull();
  });
  it("rejects control characters", () => {
    expect(checkEntryPath("a\u0000.js")).not.toBeNull();
  });
});

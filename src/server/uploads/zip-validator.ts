/**
 * Validates and extracts an uploaded game build (ZIP). Pure Node — no app
 * imports — so it can be unit tested with crafted malicious archives.
 *
 * Defences:
 *  - compressed size cap (checked before parsing)
 *  - entry count cap, per-file and total *actual* inflated byte caps (counted
 *    while streaming; header sizes are never trusted) → zip bombs
 *  - per-entry compression ratio cap → zip bombs that stay under the total cap
 *  - path rules: no absolute paths, drive letters, backslashes, "..", control
 *    characters, or overly long/deep paths → path traversal ("zip slip")
 *  - symlinks and other non-regular files rejected (Unix mode bits)
 *  - encrypted entries rejected
 *  - extension allowlist; executables/server code rejected
 *  - case-insensitive duplicate detection
 *  - index.html required at the root (one wrapping folder is flattened)
 */
import { Readable } from "node:stream";
import yauzl from "yauzl";
import { ALLOWED_EXTENSIONS } from "../storage/driver";
import { GAME_META_FILE } from "../game-host-policy";

export type ZipLimits = {
  maxCompressedBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxRatio: number;
  maxPathLength: number;
  maxDepth: number;
};

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxCompressedBytes: 100 * 1024 * 1024,
  maxEntries: 2000,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxRatio: 100,
  maxPathLength: 200,
  maxDepth: 12,
};

const IGNORED = [/^__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)desktop\.ini$/i];

export type ExtractedFile = { path: string; data: Buffer };
export type ZipResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  files: ExtractedFile[];
  totalBytes: number;
  compressedBytes: number;
};

export function checkEntryPath(raw: string): string | null {
  if (raw.length === 0) return "empty file name";
  if (raw.includes("\\")) return "backslash in path";
  if (/[\x00-\x1f\x7f]/.test(raw)) return "control character in path";
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return "absolute path";
  const parts = raw.replace(/\/$/, "").split("/");
  if (parts.some((p) => p === ".." )) return "parent directory reference";
  if (parts.some((p) => p === "." || p === "")) return "empty or '.' path segment";
  return null;
}

function openZip(buf: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, decodeStrings: true }, (err, zip) =>
      err || !zip ? reject(err ?? new Error("unreadable zip")) : resolve(zip),
    ),
  );
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("cannot read entry"));
      const chunks: Buffer[] = [];
      let total = 0;
      (stream as Readable).on("data", (c: Buffer) => {
        total += c.length;
        if (total > maxBytes) {
          (stream as Readable).destroy(new Error("entry exceeds size limit while inflating"));
          return;
        }
        chunks.push(c);
      });
      (stream as Readable).on("error", reject);
      (stream as Readable).on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

export async function validateZip(buf: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: ExtractedFile[] = [];
  const result = (): ZipResult => ({
    ok: errors.length === 0,
    errors,
    warnings,
    files: errors.length ? [] : files,
    totalBytes: files.reduce((n, f) => n + f.data.length, 0),
    compressedBytes: buf.length,
  });

  if (buf.length > limits.maxCompressedBytes) {
    errors.push(`Archive is ${(buf.length / 1048576).toFixed(1)} MB; the limit is ${limits.maxCompressedBytes / 1048576} MB.`);
    return result();
  }
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
    errors.push("File is not a ZIP archive.");
    return result();
  }

  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(buf);
  } catch (e) {
    errors.push(`Unreadable ZIP: ${(e as Error).message}`);
    return result();
  }
  if (zip.entryCount > limits.maxEntries) {
    zip.close();
    errors.push(`Archive has ${zip.entryCount} entries; the limit is ${limits.maxEntries}.`);
    return result();
  }

  const seen = new Set<string>();
  let total = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", async (entry: yauzl.Entry) => {
        try {
          const name = entry.fileName;
          const pathProblem = checkEntryPath(name);
          if (pathProblem) {
            errors.push(`Rejected "${name.slice(0, 80)}": ${pathProblem}.`);
            return zip.readEntry();
          }
          if (name.endsWith("/")) return zip.readEntry(); // directory
          if (IGNORED.some((r) => r.test(name))) {
            warnings.push(`Ignored system file ${name}.`);
            return zip.readEntry();
          }
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (mode === 0o120000) {
            errors.push(`Rejected "${name}": symbolic links are not allowed.`);
            return zip.readEntry();
          }
          if (mode !== 0 && mode !== 0o100000) {
            errors.push(`Rejected "${name}": not a regular file.`);
            return zip.readEntry();
          }
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
            errors.push(`Rejected "${name}": encrypted entries are not allowed.`);
            return zip.readEntry();
          }
          if (name.length > limits.maxPathLength || name.split("/").length > limits.maxDepth) {
            errors.push(`Rejected "${name.slice(0, 80)}…": path too long or too deep.`);
            return zip.readEntry();
          }
          const base = name.split("/").pop()!;
          const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
          if (!ALLOWED_EXTENSIONS.has(ext)) {
            errors.push(`Rejected "${name}": .${ext || "(no extension)"} files are not allowed in game builds.`);
            return zip.readEntry();
          }
          if (base === GAME_META_FILE) {
            errors.push(`Rejected "${name}": reserved file name.`);
            return zip.readEntry();
          }
          const key = name.toLowerCase();
          if (seen.has(key)) {
            errors.push(`Rejected "${name}": duplicate path (case-insensitive).`);
            return zip.readEntry();
          }
          seen.add(key);
          if (entry.uncompressedSize > limits.maxFileBytes) {
            errors.push(`Rejected "${name}": larger than ${limits.maxFileBytes / 1048576} MB.`);
            return zip.readEntry();
          }
          if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxRatio && entry.uncompressedSize > 1024 * 1024) {
            errors.push(`Rejected "${name}": suspicious compression ratio (possible zip bomb).`);
            return zip.readEntry();
          }
          const remaining = limits.maxTotalBytes - total;
          const data = await readEntry(zip, entry, Math.min(limits.maxFileBytes, remaining));
          total += data.length;
          if (data.length > 1024 * 1024 && entry.compressedSize > 0 && data.length / entry.compressedSize > limits.maxRatio) {
            errors.push(`Rejected "${name}": suspicious compression ratio (possible zip bomb).`);
            return zip.readEntry();
          }
          files.push({ path: name, data });
          zip.readEntry();
        } catch (e) {
          reject(e);
        }
      });
      zip.readEntry();
    });
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(/size limit|exceeds/.test(msg) ? `Archive inflates beyond the ${limits.maxTotalBytes / 1048576} MB limit (possible zip bomb).` : `Invalid archive: ${msg}`);
    zip.close();
    return result();
  }

  if (errors.length) return result();
  if (files.length === 0) {
    errors.push("Archive contains no files.");
    return result();
  }

  // Flatten a single wrapping folder (common when zipping a directory).
  if (!files.some((f) => f.path === "index.html")) {
    const tops = new Set(files.map((f) => f.path.split("/")[0]));
    const [only] = [...tops];
    if (tops.size === 1 && only && files.some((f) => f.path === `${only}/index.html`)) {
      for (const f of files) f.path = f.path.slice(only.length + 1);
      warnings.push(`Flattened top-level folder "${only}/".`);
    }
  }
  if (!files.some((f) => f.path === "index.html")) errors.push("Missing index.html at the root of the archive.");

  const html = files.find((f) => f.path === "index.html")?.data.toString("utf8") ?? "";
  if (html && !/chronoblink(\.js|\/sdk|")/i.test(html) && !/@chronoblink\/sdk/.test(html)) {
    warnings.push("index.html doesn't appear to load the ChronoBlink SDK — scores, saves and achievements won't work.");
  }
  if (/<script[^>]+src=["']https?:\/\//i.test(html)) {
    warnings.push("index.html loads scripts from external hosts; the game CSP blocks these unless an admin approves the origin.");
  }
  return result();
}

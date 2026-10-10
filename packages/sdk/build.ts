/** Builds the SDK: ESM for npm, IIFE for <script src="/sdk/v1/chronoblink.js">, and .d.ts files. */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "dist");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(dir, "src/index.ts")],
  outfile: path.join(out, "index.js"),
  bundle: true,
  format: "esm",
  target: "es2019",
  sourcemap: true,
});
await build({
  entryPoints: [path.join(dir, "src/global.ts")],
  outfile: path.join(out, "chronoblink.js"),
  bundle: true,
  format: "iife",
  target: "es2017",
  minify: true,
  legalComments: "none",
  banner: { js: "/* @chronoblink/sdk v1 | https://www.chronoblink.xyz/developers/docs */" },
});
execFileSync(process.execPath, [path.resolve(dir, "../../node_modules/typescript/bin/tsc"), "-p", path.join(dir, "tsconfig.json")], {
  stdio: "inherit",
});
console.log("[sdk] built packages/sdk/dist");

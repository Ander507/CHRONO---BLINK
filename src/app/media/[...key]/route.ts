import { Readable } from "node:stream";
import { storage } from "@/server/services/storage";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

/** Serves cover art from storage. Only raster images under media/ — never HTML or SVG. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.map((s) => decodeURIComponent(s)).join("/");
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(path)) return new Response("Not found", { status: 404 });
  const obj = await storage.get(`media/${path}`).catch(() => null);
  if (!obj || !IMAGE_TYPES.has(obj.contentType)) {
    obj?.body.destroy();
    return new Response("Not found", { status: 404 });
  }
  return new Response(Readable.toWeb(obj.body) as ReadableStream, {
    headers: {
      "content-type": obj.contentType,
      "content-length": String(obj.size),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

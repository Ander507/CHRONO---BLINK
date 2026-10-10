import { readToken } from "@/server/storage/driver";
import { env } from "@/server/env";
import { errorResponse, json } from "@/server/http";
import { HttpError } from "@/server/session";
import { storage } from "@/server/services/storage";

type UploadToken = { k: string; b: number; ct: string; exp: number };

/**
 * Local-storage stand-in for a presigned R2 PUT URL (STORAGE_DRIVER=local).
 * The HMAC token pins the object key, the exact byte size and the expiry, so
 * this endpoint can't be used to write anything else.
 */
export async function PUT(req: Request) {
  try {
    if (storage.kind !== "local") throw new HttpError(404, "not_found");
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const t = readToken<UploadToken>(env.PLATFORM_SIGNING_SECRET, token);
    if (!t || !t.k.startsWith("uploads/")) throw new HttpError(403, "bad_token", "Upload link expired or invalid");
    const declared = Number(req.headers.get("content-length") ?? -1);
    if (declared !== t.b) throw new HttpError(400, "size_mismatch", "Content-Length must match the reserved upload size");
    if (!req.body) throw new HttpError(400, "empty", "Empty upload");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > t.b) throw new HttpError(413, "too_large", "Upload larger than reserved");
      chunks.push(value);
    }
    if (total !== t.b) throw new HttpError(400, "size_mismatch", "Upload size mismatch");
    await storage.put(t.k, Buffer.concat(chunks), t.ct);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

import "server-only";
import { createStorageFromEnv, type StorageDriver } from "@/server/storage/driver";
import { env } from "@/server/env";

declare global {
  var __cbStorage: StorageDriver | undefined;
}

export const storage: StorageDriver = globalThis.__cbStorage ?? createStorageFromEnv(process.env);
if (env.NODE_ENV !== "production") globalThis.__cbStorage = storage;

/** Public URL for a media object (cover art). Proxied through the app unless a CDN base is configured. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (env.MEDIA_PUBLIC_BASE_URL) return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  return `/media/${key.replace(/^media\//, "")}`;
}

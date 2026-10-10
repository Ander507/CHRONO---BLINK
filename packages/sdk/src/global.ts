/** IIFE entry: exposes `window.ChronoBlink` for games loaded with a <script> tag. */
import { ChronoBlink, SDK_VERSION } from "./index";

declare global {
  interface Window {
    ChronoBlink: typeof ChronoBlink & { version?: string };
  }
}

if (typeof window !== "undefined" && !window.ChronoBlink) {
  window.ChronoBlink = Object.assign(ChronoBlink, { version: SDK_VERSION });
}

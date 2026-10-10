"use client";

import Script from "next/script";
import * as React from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; theme: string }) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const turnstileEnabled = Boolean(SITE_KEY);

/**
 * Cloudflare Turnstile widget. Renders nothing when no site key is configured
 * (local development); the server then skips verification only outside production.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    if (!SITE_KEY || !loaded || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      theme: "dark",
      callback: (t) => onToken(t),
      "expired-callback": () => onToken(null),
    });
    return () => window.turnstile?.reset(id);
  }, [loaded, onToken]);
  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onLoad={() => setLoaded(true)} />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}

export function captchaHeaders(token: string | null): Record<string, string> {
  return token ? { "x-captcha-response": token } : {};
}

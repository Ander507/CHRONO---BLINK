"use client";

/**
 * Google H5 Games Ads (Ad Placement API) adapter for in-game interstitial and
 * rewarded ads. Only invoked after the server confirmed the placement is
 * enabled with a real publisher id AND the player consented to advertising.
 *
 * Untested against a live account in this repository — it requires an
 * approved AdSense for Games publisher id. `rewarded` is only reported true
 * when the provider calls `adViewed`; we never infer completion ourselves.
 */
type AdBreakConfig = {
  type: "start" | "pause" | "next" | "browse" | "reward";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: { breakStatus: string }) => void;
};
declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (c: AdBreakConfig) => void;
    adConfig?: (c: Record<string, unknown>) => void;
  }
}

let loading: Promise<boolean> | null = null;
function loadSdk(clientId: string): Promise<boolean> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    s.crossOrigin = "anonymous";
    s.dataset.adFrequencyHint = "120s";
    s.onload = () => {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = function (o: unknown) {
        window.adsbygoogle!.push(o);
      };
      window.adConfig?.({ preloadAdBreaks: "on", sound: "on" });
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loading;
}

export async function showH5Ad(opts: {
  type: "midgame" | "rewarded";
  clientId: string;
  onStart: () => void;
}): Promise<{ shown: boolean; rewarded: boolean; reason?: string }> {
  if (!opts.clientId || !(await loadSdk(opts.clientId)) || !window.adBreak) {
    return { shown: false, rewarded: false, reason: "provider_unavailable" };
  }
  return new Promise((resolve) => {
    let shown = false;
    let rewarded = false;
    const done = setTimeout(() => resolve({ shown, rewarded, reason: "timeout" }), 90_000);
    window.adBreak!({
      type: opts.type === "rewarded" ? "reward" : "next",
      name: opts.type,
      beforeAd: () => {
        shown = true;
        opts.onStart();
      },
      beforeReward: (show) => show(),
      adViewed: () => {
        rewarded = true;
      },
      adBreakDone: (info) => {
        clearTimeout(done);
        resolve({ shown, rewarded: opts.type === "rewarded" && rewarded, reason: info.breakStatus });
      },
    });
  });
}

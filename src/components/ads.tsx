"use client";

import Script from "next/script";
import * as React from "react";
import { useConsent } from "@/components/consent";

/**
 * Display ad slot. Renders nothing unless (a) an admin enabled the placement
 * with real provider credentials and (b) the visitor consented to advertising.
 * Never placed over game controls. Labelled as an advertisement.
 *
 * Note: the provider's script origin must also be added to CSP_EXTRA_SCRIPT_SRC
 * / CSP_EXTRA_FRAME_SRC when enabling a provider (see docs/MONETIZATION.md).
 */
export function AdUnit({ slot }: { slot: { provider: string; clientId: string; slotId: string } | null }) {
  const { consent } = useConsent();
  const pushed = React.useRef(false);
  const enabled = Boolean(slot && consent?.ads && slot.provider === "adsense");
  React.useEffect(() => {
    if (!enabled || pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* provider unavailable */
    }
  }, [enabled]);
  if (!enabled || !slot) return null;
  return (
    <aside aria-label="Advertisement" className="rounded-2xl border border-line bg-surface p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Advertisement</p>
      <Script
        id="adsense"
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(slot.clientId)}`}
        crossOrigin="anonymous"
      />
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={slot.clientId}
        data-ad-slot={slot.slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { clearAnonId } from "@/lib/local";

/**
 * Consent model (EU ePrivacy / GDPR oriented — see docs/PRIVACY.md):
 *  - necessary: sign-in session cookie, this consent record, play-session
 *    bookkeeping needed to run games, leaderboards and saves. Always on.
 *  - analytics: first-party product analytics events and a random device id
 *    used to count returning guests. Off until accepted.
 *  - ads: lets configured ad providers run (and set their cookies). Off until
 *    accepted; no ads render at all while no provider is configured.
 * Rejecting is exactly as easy as accepting.
 */
export type Consent = { analytics: boolean; ads: boolean; v: 1; at: number };
const COOKIE = "cb_consent";

function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(COOKIE);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return c.v === 1 ? c : null;
  } catch {
    return null;
  }
}
function writeConsent(c: Consent) {
  try {
    window.localStorage.setItem(COOKIE, JSON.stringify(c));
  } catch {
    /* ignore */
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=a${c.analytics ? 1 : 0}d${c.ads ? 1 : 0}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
  if (!c.analytics) clearAnonId();
}

type Ctx = {
  consent: Consent | null;
  ready: boolean;
  update: (c: { analytics: boolean; ads: boolean }) => void;
  openPreferences: () => void;
};
const ConsentContext = React.createContext<Ctx>({ consent: null, ready: false, update: () => {}, openPreferences: () => {} });
export const useConsent = () => React.useContext(ConsentContext);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = React.useState<Consent | null>(null);
  const [ready, setReady] = React.useState(false);
  const [prefsOpen, setPrefsOpen] = React.useState(false);

  React.useEffect(() => {
    // Reading storage must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent());
    setReady(true);
  }, []);

  const update = React.useCallback((c: { analytics: boolean; ads: boolean }) => {
    const next: Consent = { ...c, v: 1, at: Date.now() };
    writeConsent(next);
    setConsent(next);
    setPrefsOpen(false);
  }, []);

  const value = React.useMemo(() => ({ consent, ready, update, openPreferences: () => setPrefsOpen(true) }), [consent, ready, update]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {ready && !consent ? <ConsentBanner onCustomize={() => setPrefsOpen(true)} onChoose={update} /> : null}
      <PreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} current={consent} onSave={update} />
    </ConsentContext.Provider>
  );
}

function ConsentBanner({ onChoose, onCustomize }: { onChoose: (c: { analytics: boolean; ads: boolean }) => void; onCustomize: () => void }) {
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl md:bottom-4" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <div className="surface glass flex flex-col gap-4 p-4 shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:p-5">
        <div className="flex gap-3">
          <Cookie className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-fg-muted">
            We use necessary cookies to run ChronoBlink. With your permission we&apos;d also use first-party analytics to improve
            games, and allow ads once ad partners are enabled.{" "}
            <Link href="/legal/cookies" className="text-electric underline underline-offset-2">
              Cookie policy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Button size="sm" onClick={() => onChoose({ analytics: true, ads: true })}>
            Accept all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onChoose({ analytics: false, ads: false })}>
            Reject non-essential
          </Button>
          <Button size="sm" variant="ghost" onClick={onCustomize}>
            Customize
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreferencesDialog({
  open,
  onOpenChange,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: Consent | null;
  onSave: (c: { analytics: boolean; ads: boolean }) => void;
}) {
  const [analytics, setAnalytics] = React.useState(current?.analytics ?? false);
  const [ads, setAds] = React.useState(current?.ads ?? false);
  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalytics(current?.analytics ?? false);
    setAds(current?.ads ?? false);
  }, [open, current]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Privacy preferences" description="Choose what ChronoBlink may store on this device. You can change this any time from the footer.">
        <div className="space-y-3">
          <Row title="Necessary" text="Sign-in, security, consent record and the play sessions that make games, saves and leaderboards work." checked disabled />
          <Row title="Analytics" text="First-party usage events and an anonymous device id to count returning players. Never sold or shared." checked={analytics} onChange={setAnalytics} />
          <Row title="Advertising" text="Allows approved ad partners to show ads and set their own cookies. Currently no ad partner is active." checked={ads} onChange={setAds} />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onSave({ analytics: false, ads: false })}>
            Reject all
          </Button>
          <Button onClick={() => onSave({ analytics, ads })}>Save choices</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ title, text, checked, disabled, onChange }: { title: string; text: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  const id = `consent-${title.toLowerCase()}`;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-raised/50 p-3.5">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {title}
        </label>
        <p className="mt-0.5 text-xs text-fg-muted">{text}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function ConsentPreferencesLink() {
  const { openPreferences } = useConsent();
  return (
    <button type="button" onClick={openPreferences} className="hover:text-fg">
      Cookie preferences
    </button>
  );
}

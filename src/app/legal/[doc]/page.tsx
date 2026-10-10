import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/server/env";

type Doc = { title: string; updated: string; body: React.ReactNode };

const OPERATOR = "[Legal entity name], [registered address], [company registration number]";
const CONTACT = "[privacy@chronoblink.xyz]";

const DOCS: Record<string, Doc> = {
  terms: {
    title: "Terms of Service",
    updated: "2026-10-10",
    body: (
      <>
        <h2>1. Who we are</h2>
        <p>ChronoBlink Arcade (&ldquo;ChronoBlink&rdquo;, &ldquo;we&rdquo;) is operated by {OPERATOR}.</p>
        <h2>2. Using the service</h2>
        <p>You can play without an account. Accounts are optional, free, and for individuals aged 16+ (or the age of digital consent in your country).</p>
        <h2>3. Your account</h2>
        <ul>
          <li>Keep your credentials secure. You&apos;re responsible for activity on your account.</li>
          <li>Usernames must not impersonate others or be offensive. We may rename or suspend accounts that break these Terms.</li>
        </ul>
        <h2>4. Fair play</h2>
        <p>
          Don&apos;t cheat, automate gameplay, tamper with scores, exploit bugs, or interfere with other players or the service. Leaderboards labelled
          &ldquo;provisional&rdquo; carry no prizes. We may remove scores, XP and achievements obtained unfairly.
        </p>
        <h2>5. Games and third-party content</h2>
        <p>Games are provided by ChronoBlink Studio and independent developers. Each game&apos;s developer is responsible for its content.</p>
        <h2>6. Virtual progression</h2>
        <p>XP, levels, achievements and cosmetics have no monetary value and can&apos;t be transferred or exchanged.</p>
        <h2>7. Termination</h2>
        <p>You can delete your account at any time in Settings. We may suspend accounts that violate these Terms.</p>
        <h2>8. Liability</h2>
        <p>[To be completed by counsel — limitation of liability and consumer rights under applicable EU/member-state law.]</p>
        <h2>9. Governing law</h2>
        <p>[Jurisdiction to be completed by counsel.]</p>
      </>
    ),
  },
  privacy: {
    title: "Privacy Policy",
    updated: "2026-10-10",
    body: (
      <>
        <h2>Controller</h2>
        <p>
          {OPERATOR}. Contact: {CONTACT}.
        </p>
        <h2>What we collect and why</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Purpose</th>
              <th>Legal basis (GDPR Art. 6)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account: email, username, display name, password hash</td>
              <td>Provide your account</td>
              <td>Contract (6(1)(b))</td>
            </tr>
            <tr>
              <td>Gameplay: play sessions, active play time, runs, scores, saves, achievements, XP</td>
              <td>Run games, leaderboards, progression and saves; prevent abuse</td>
              <td>Contract (6(1)(b)); legitimate interest in fair play (6(1)(f))</td>
            </tr>
            <tr>
              <td>Security: IP address (sessions, rate limiting, audit logs)</td>
              <td>Security and abuse prevention</td>
              <td>Legitimate interest (6(1)(f))</td>
            </tr>
            <tr>
              <td>Analytics events and an anonymous device id</td>
              <td>Improve games and the platform</td>
              <td>Consent (6(1)(a)) — only if you accept analytics</td>
            </tr>
            <tr>
              <td>Advertising identifiers (set by ad partners)</td>
              <td>Show ads</td>
              <td>Consent (6(1)(a)) — only if you accept advertising; no ad partner is currently active</td>
            </tr>
          </tbody>
        </table>
        <h2>Processors</h2>
        <p>[List hosting, database, Cloudflare (CDN, R2, Turnstile), email provider and any ad partner, with locations and transfer safeguards.]</p>
        <h2>Retention</h2>
        <ul>
          <li>Raw analytics events and anonymous device ids: {env.ANALYTICS_RETENTION_DAYS} days.</li>
          <li>Account data: until you delete your account.</li>
          <li>Security audit logs: [period to be set by counsel].</li>
        </ul>
        <h2>Your rights</h2>
        <p>
          Access and portability: Settings → Export my data. Erasure: Settings → Delete account. You can also request rectification, restriction or object to
          processing via {CONTACT}, and complain to your data protection authority.
        </p>
        <h2>Games</h2>
        <p>Games run in an isolated sandbox on a separate domain and can&apos;t read your account, cookies or other data.</p>
      </>
    ),
  },
  cookies: {
    title: "Cookie Policy",
    updated: "2026-10-10",
    body: (
      <>
        <h2>Strictly necessary</h2>
        <ul>
          <li>
            <code>cb.session_token</code> (and related <code>cb.*</code> auth cookies) — keeps you signed in. Up to 30 days.
          </li>
          <li>
            <code>cb_consent</code> — remembers your cookie choices. 180 days.
          </li>
          <li>Local storage on this device: guest play history, guest game saves, mute preference.</li>
        </ul>
        <h2>Analytics (only with consent)</h2>
        <ul>
          <li>
            <code>cb.anon</code> (local storage) — random id to count returning guests. Deleted when you withdraw consent; cleared from our records after{" "}
            {env.ANALYTICS_RETENTION_DAYS} days.
          </li>
        </ul>
        <h2>Advertising (only with consent)</h2>
        <p>No ad partner is currently active. If one is enabled, its cookies will be listed here before they are used.</p>
        <p>Change your choices any time via “Cookie preferences” in the footer or in Settings.</p>
      </>
    ),
  },
  "developer-agreement": {
    title: "Developer Agreement",
    updated: "2026-10-10",
    body: (
      <>
        <h2>1. Your content</h2>
        <p>You confirm you own, or are licensed to distribute, every file, asset, trademark and piece of code you upload, and that it contains no malware.</p>
        <h2>2. Licence to ChronoBlink</h2>
        <p>You grant ChronoBlink a non-exclusive, worldwide, royalty-free licence to host, cache, distribute and display your game and its listing on the service.</p>
        <h2>3. Review</h2>
        <p>Every build is validated, may be scanned, and is reviewed before publication. We may reject, unlist or remove games at our discretion.</p>
        <h2>4. Platform rules</h2>
        <ul>
          <li>No tracking, ads or monetisation outside the ChronoBlink SDK.</li>
          <li>No attempts to escape the sandbox, collect personal data, or interfere with players or the service.</li>
          <li>Accurate descriptions, controls and device support.</li>
        </ul>
        <h2>5. Revenue sharing</h2>
        <p>
          Revenue sharing is not yet available. No earnings are owed or promised until a separate revenue-share addendum is signed and payouts are enabled following
          identity verification, tax and financial compliance.
        </p>
        <h2>6. Termination</h2>
        <p>You may remove your games at any time by contacting us. [Further terms to be completed by counsel.]</p>
      </>
    ),
  },
};

type Props = { params: Promise<{ doc: string }> };

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = DOCS[(await params).doc];
  return d ? { title: d.title, alternates: { canonical: `/legal/${(await params).doc}` } } : { title: "Not found" };
}

export default async function LegalPage({ params }: Props) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <article className="prose-cb mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-extrabold text-fg">{d.title}</h1>
      <p className="text-sm">Last updated {d.updated}</p>
      <div className="my-6 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        <AlertTriangle className="size-5 shrink-0" />
        <p className="m-0">
          Template — requires review by qualified legal counsel before launch. Bracketed sections must be completed. ChronoBlink makes no claim that this document
          is legally compliant as written.
        </p>
      </div>
      {d.body}
    </article>
  );
}

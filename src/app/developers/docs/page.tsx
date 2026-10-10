import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "ChronoBlink SDK documentation",
  description: "Integrate your HTML5 game with ChronoBlink Arcade: lifecycle, scores, achievements, cloud saves, ads and the sandbox your game runs in.",
  alternates: { canonical: "/developers/docs" },
};

const TOC = [
  ["quick-start", "Quick start"],
  ["lifecycle", "Lifecycle"],
  ["scores", "Scores & leaderboards"],
  ["achievements", "Achievements"],
  ["saves", "Cloud saves"],
  ["events", "Pause, mute & fullscreen"],
  ["ads", "Ads"],
  ["analytics", "Analytics & errors"],
  ["standalone", "Running outside ChronoBlink"],
  ["sandbox", "The sandbox"],
  ["builds", "Build requirements"],
  ["review", "Review checklist"],
  ["protocol", "Wire protocol"],
] as const;

function Code({ children }: { children: string }) {
  return (
    <pre>
      <code>{children.trim()}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm" aria-label="Documentation sections">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-fg-muted hover:bg-raised hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <article className="prose-cb max-w-3xl">
        <PageHeader title="ChronoBlink SDK" description="@chronoblink/sdk v1 · protocol 1 · ~7 KB minified, no dependencies." />

        <h2 id="quick-start">Quick start</h2>
        <p>The simplest integration is a script tag. The game origin serves the SDK at a stable path:</p>
        <Code>{`
<script src="/sdk/v1/chronoblink.js"></script>
<script>
  ChronoBlink.init().then(({ player }) => {
    console.log("Hello", player.displayName);
    ChronoBlink.loadingDone();
  });
</script>`}</Code>
        <p>With a bundler, install the package and import it. The API is identical.</p>
        <Code>{`
import { ChronoBlink } from "@chronoblink/sdk";

await ChronoBlink.init();
ChronoBlink.gameplayStart();
await ChronoBlink.submitScore({ leaderboard: "highscore", score: 12500 });
await ChronoBlink.unlockAchievement("first_win");
await ChronoBlink.saveData("progress", { level: 5 });
const progress = await ChronoBlink.loadData("progress");`}</Code>
        <p>
          A complete, minimal example lives in the repository at <code>examples/sdk-starter/</code>. The three launch games (<Link href="/play/chrono-blink">CHRONO // BLINK</Link>,{" "}
          <Link href="/play/neon-drift">Neon Drift</Link>, <Link href="/play/pulse-stack">Pulse Stack</Link>) are real integrations too.
        </p>

        <h2 id="lifecycle">Lifecycle</h2>
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>init()</code>
              </td>
              <td>At boot. Resolves with the player, settings and capabilities. Safe to call many times.</td>
            </tr>
            <tr>
              <td>
                <code>loadingProgress(0..1)</code> / <code>loadingDone()</code>
              </td>
              <td>Drive the platform&apos;s loading bar; call <code>loadingDone()</code> when your title screen is interactive.</td>
            </tr>
            <tr>
              <td>
                <code>gameplayStart()</code>
              </td>
              <td>When a run actually begins. The server starts timing the run.</td>
            </tr>
            <tr>
              <td>
                <code>gameplayStop()</code>
              </td>
              <td>On game over or quitting to the menu. Ends the server-timed run.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Don&apos;t call <code>gameplayStop()</code> for a manual pause — pausing doesn&apos;t end the run. Runs of at least 10 seconds count toward platform progression.
        </p>

        <h2 id="scores">Scores &amp; leaderboards</h2>
        <Code>{`
ChronoBlink.gameplayStop();
const r = await ChronoBlink.submitScore({ leaderboard: "highscore", score });
// r = { accepted, provisional?, best?, rank?, reason? }
if (r.reason === "guest") showHint("Sign in on ChronoBlink to rank");`}</Code>
        <ul>
          <li>Submit once per run, after <code>gameplayStop()</code>, as a non-negative integer.</li>
          <li>Only signed-in players are ranked; guests get <code>reason: &quot;guest&quot;</code>.</li>
          <li>
            The server rejects scores that don&apos;t belong to a server-timed run, that come from runs shorter than the board minimum, or that exceed the board&apos;s
            plausibility ceiling (<code>baseAllowance + maxScorePerSecond × runSeconds</code>). Tell the reviewer your realistic maximum points per second.
          </li>
          <li>Rankings exist for today, this week (Monday 00:00 UTC), this season (calendar quarter) and all-time; they roll over automatically.</li>
        </ul>
        <p>
          <strong>Anti-cheat honesty:</strong> a game that runs entirely in the player&apos;s browser can always be manipulated. The checks above stop casual and scripted
          abuse, but boards fed by client-side games are labelled <em>provisional</em> and never carry prizes. Competitive games can use a server-side verification
          adapter (e.g. deterministic replay validation) — contact us to set one up; those boards are marked <em>verified</em>.
        </p>

        <h2 id="achievements">Achievements</h2>
        <Code>{`await ChronoBlink.unlockAchievement("survive_60"); // → { unlocked: boolean }`}</Code>
        <p>
          Achievements are defined by ChronoBlink during review. Achievements the server can verify (e.g. &ldquo;score 10,000&rdquo;) unlock automatically from submitted
          scores. Achievements only your game can know about are marked <em>game-reported</em>: they require a signed-in player and a server-timed run of a minimum
          length, and their XP counts toward the daily XP cap.
        </p>

        <h2 id="saves">Cloud saves</h2>
        <Code>{`
await ChronoBlink.saveData("progress", { level: 5, coins: 120 });
const progress = await ChronoBlink.loadData("progress"); // null if nothing saved
await ChronoBlink.deleteData("progress");`}</Code>
        <ul>
          <li>Keys: 1–64 characters of <code>A–Z a–z 0–9 _ . -</code>. Values: JSON, at most 16 KB each, at most 32 keys per game.</li>
          <li>Signed-in players save to the cloud; guests save to their device through the platform. Guests can import device saves when they create an account.</li>
          <li>
            Your game runs on an opaque origin, so <code>localStorage</code>, <code>IndexedDB</code> and cookies throw or are empty. Use these methods instead.
          </li>
        </ul>

        <h2 id="events">Pause, mute &amp; fullscreen</h2>
        <Code>{`
ChronoBlink.on("pause", () => game.freeze());     // tab hidden, ad playing…
ChronoBlink.on("resume", () => game.unfreeze());
ChronoBlink.on("mute", () => audio.mute());
ChronoBlink.on("unmute", () => audio.unmute());
await ChronoBlink.requestFullscreen();            // platform makes the player fullscreen`}</Code>
        <p>Respect the platform&apos;s mute: the player toolbar&apos;s mute button only works through these events.</p>

        <h2 id="ads">Ads</h2>
        <Code>{`
const r = await ChronoBlink.requestAd("rewarded"); // or "midgame" at a natural break
if (r.rewarded) grantExtraLife();                  // only when the provider confirmed completion`}</Code>
        <p>
          Ads only run when ChronoBlink has an approved ad provider, the placement is enabled, the player consented, and the frequency cap allows it. Otherwise the
          call resolves immediately with <code>shown: false</code> — your game must keep working. The platform pauses and mutes your game around every ad.
        </p>

        <h2 id="analytics">Analytics &amp; errors</h2>
        <Code>{`
ChronoBlink.track("level_complete", { level: 3, seconds: 41 });
window.addEventListener("error", (e) => ChronoBlink.reportError(e.error));`}</Code>
        <p>
          Custom events are stored only for players who accepted analytics cookies. Sessions, active playtime, load success and run counts are measured by the
          platform for you.
        </p>

        <h2 id="standalone">Running outside ChronoBlink</h2>
        <p>
          Every method is safe outside the platform (<code>file://</code>, itch.io, your own site). After a 3-second handshake timeout the SDK enters standalone mode:{" "}
          <code>init()</code> resolves with <code>platform: &quot;standalone&quot;</code>, saves use <code>localStorage</code> when available, and score/ad calls resolve
          with <code>reason: &quot;standalone&quot;</code>.
        </p>

        <h2 id="sandbox">The sandbox</h2>
        <ul>
          <li>
            Games are served from a separate domain inside <code>&lt;iframe sandbox=&quot;allow-scripts allow-pointer-lock&quot;&gt;</code> — no same-origin access, no
            popups, no forms, no top-level navigation.
          </li>
          <li>
            A strict Content-Security-Policy applies: scripts, styles, images, audio, fonts, WebAssembly, workers and <code>fetch</code> are limited to your own build.
            External origins (e.g. a font CDN) need reviewer approval.
          </li>
          <li>Camera, microphone, geolocation, payment and similar APIs are disabled. Pointer lock and gamepads work.</li>
          <li>
            Call <code>preventDefault()</code> on Space and arrow keys so the page never scrolls — the platform also locks page scrolling while your game has focus.
          </li>
        </ul>

        <h2 id="builds">Build requirements</h2>
        <ul>
          <li>A ZIP with <code>index.html</code> at the root (a single wrapping folder is flattened automatically).</li>
          <li>≤ 100 MB zipped, ≤ 250 MB unpacked, ≤ 2,000 files, ≤ 50 MB per file.</li>
          <li>
            Web asset types only (HTML, JS, CSS, JSON, images, audio, video, fonts, WASM, common engine data files). Executables, server scripts, symlinks and
            encrypted entries are rejected.
          </li>
          <li>Use relative URLs for your assets. Every build is served from an immutable, versioned URL.</li>
          <li>SharedArrayBuffer (COOP/COEP) isn&apos;t available in this version.</li>
        </ul>

        <h2 id="review">Review checklist</h2>
        <ul>
          <li>Original work, or assets you have the rights to (licences may be requested).</li>
          <li>Loads reliably, has a title screen, a game-over state and a fast restart.</li>
          <li>Uses the SDK lifecycle correctly and submits integer scores once per run.</li>
          <li>No external tracking, ads or monetisation outside the SDK; no attempts to escape the sandbox.</li>
          <li>Content appropriate for a general audience, with accurate descriptions, controls and device support.</li>
        </ul>

        <h2 id="protocol">Wire protocol</h2>
        <p>You never need this unless you write your own client. Protocol version 1:</p>
        <Code>{`
// handshake (window.postMessage — the frame's origin is opaque, so "*" is required)
game   → parent : { cbsdk: 1, kind: "hello", sdkVersion, nonce }
parent → game   : { cbsdk: 1, kind: "connect", protocol: 1, nonce }  + MessagePort

// over the private MessagePort
request  : { id, method, params }
response : { id, ok: true, result } | { id, ok: false, error: { code, message } }
event    : { event: "pause" | "resume" | "mute" | "unmute" }`}</Code>
        <p>
          The platform authenticates the frame by object identity (<code>event.source === iframe.contentWindow</code>), validates every request against a schema,
          rate-limits each method, and authorises the play session server-side. The game authenticates the platform by checking <code>event.source === window.parent</code>{" "}
          and the echoed nonce.
        </p>
      </article>
    </div>
  );
}

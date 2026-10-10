import { BarChart3, Code2, FileCheck2, Gauge, ShieldCheck, Trophy, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivateDeveloperForm } from "@/components/developer/activate-form";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { integrations } from "@/server/env";
import { getCurrentUser } from "@/server/session";
import { getDeveloper } from "@/server/services/developer";

export const metadata: Metadata = {
  title: "Publish your HTML5 game",
  description: "Bring your browser game to ChronoBlink Arcade: instant play, leaderboards, achievements, cloud saves and real analytics through the ChronoBlink SDK.",
  alternates: { canonical: "/developers" },
};

const FEATURES = [
  { icon: Code2, title: "Tiny SDK", text: "One script tag or npm import. Scores, achievements, cloud saves, pause/mute events and fullscreen in a few lines." },
  { icon: ShieldCheck, title: "Sandboxed by default", text: "Every game runs on an isolated origin with a strict CSP. Players stay safe; your game never touches their account." },
  { icon: Trophy, title: "Progression built in", text: "Leaderboards with daily, weekly and seasonal rollover, platform XP, achievements and daily challenges." },
  { icon: BarChart3, title: "Honest analytics", text: "Sessions, unique players, active playtime, start conversion, devices and retention — measured, never estimated." },
  { icon: FileCheck2, title: "Human review", text: "Validated uploads, a private preview, and a reviewer approves every build before it goes live." },
  { icon: Gauge, title: "Fast delivery", text: "Immutable, versioned builds served from a CDN-friendly game origin. Players load only the game they pick." },
];

export default async function DevelopersPage() {
  const user = await getCurrentUser();
  const dev = user ? await getDeveloper(user.id) : null;
  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-12 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-electric">ChronoBlink for developers</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight text-fg sm:text-5xl">Ship your browser game to players who are ready to play.</h1>
          <p className="mt-4 text-lg text-fg-muted">
            Upload an HTML5 build — Canvas, WebGL, WebAssembly, Phaser or anything self-contained — integrate the SDK, and we handle hosting, sandboxing,
            progression and discovery.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {dev ? (
              <Button asChild size="lg">
                <Link href="/developers/dashboard">Open dashboard</Link>
              </Button>
            ) : user ? (
              <Button asChild size="lg">
                <a href="#activate">Activate developer account</a>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href="/register?next=/developers">Create an account</Link>
              </Button>
            )}
            <Button asChild size="lg" variant="secondary">
              <Link href="/developers/docs">Read the SDK docs</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-5">
            <f.icon className="size-6 text-primary" />
            <h2 className="mt-3 font-display text-lg font-bold text-fg">{f.title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{f.text}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl font-bold text-fg">How publishing works</h2>
          <ol className="mt-4 space-y-3 text-sm text-fg-muted">
            {[
              "Activate a developer account and accept the Developer Agreement.",
              "Create a listing: title, description, category, tags, controls and cover art.",
              "Upload a ZIP of your build. We validate it (structure, file types, size, zip-bomb and path-traversal checks) and scan it.",
              "Preview the build in the same sandbox players use.",
              "Submit for review. A ChronoBlink reviewer approves it or sends feedback.",
              "Approved builds go live instantly on an immutable, versioned URL. Updates repeat the review.",
            ].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-hover">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-6" id="activate">
          <h2 className="font-display text-xl font-bold text-fg">Get started</h2>
          {!integrations.malwareScanner ? (
            <div className="mt-4">
              <FormMessage tone="info">
                Build uploads are currently open to verified studios only while automated malware scanning is being rolled out. You can activate your account and
                prepare listings now; contact us to get your studio verified.
              </FormMessage>
            </div>
          ) : null}
          <div className="mt-5">
            {dev ? (
              <p className="text-sm text-fg-muted">
                You&apos;re registered as <span className="font-semibold text-fg">{dev.studioName}</span>.{" "}
                <Link href="/developers/dashboard" className="text-electric hover:underline">
                  Go to your dashboard →
                </Link>
              </p>
            ) : user ? (
              user.emailVerified ? (
                <ActivateDeveloperForm />
              ) : (
                <p className="text-sm text-fg-muted">Verify your email address to activate a developer account.</p>
              )
            ) : (
              <div className="flex items-center gap-3">
                <Upload className="size-5 text-fg-subtle" />
                <p className="text-sm text-fg-muted">
                  <Link href="/login?next=/developers" className="text-electric hover:underline">
                    Sign in
                  </Link>{" "}
                  or{" "}
                  <Link href="/register?next=/developers" className="text-electric hover:underline">
                    create an account
                  </Link>{" "}
                  to become a developer.
                </p>
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

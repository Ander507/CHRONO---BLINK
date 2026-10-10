import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { safeRedirect } from "@/lib/validation";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeRedirect(sp.next, "/");
  const user = await getCurrentUser();
  if (sp.error || !user) {
    return (
      <AuthCard title="Verification link problem">
        <FormMessage>That verification link is invalid or has expired. Sign in to get a new one.</FormMessage>
        <Button asChild className="mt-5 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`You're in, ${user.name}!`} subtitle="Your email is verified and your account is ready.">
      <ul className="space-y-2 text-sm text-fg-muted">
        {["Earn XP and level up from real play", "Unlock platform and game achievements", "Post scores to leaderboards", "Take on the daily challenge"].map(
          (t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> {t}
            </li>
          ),
        )}
      </ul>
      <Button asChild className="mt-6 w-full" size="lg">
        <Link href={next}>Start playing</Link>
      </Button>
    </AuthCard>
  );
}

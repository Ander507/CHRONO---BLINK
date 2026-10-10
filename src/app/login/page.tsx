import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { FormMessage } from "@/components/ui/form";
import { safeRedirect } from "@/lib/validation";
import { env, integrations } from "@/server/env";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = safeRedirect(sp.next, "/");
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to keep your XP, achievements, favorites and cloud saves."
      footer={
        <>
          New to ChronoBlink?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-electric hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {sp.reset ? (
        <div className="mb-4">
          <FormMessage tone="success">Password updated. Sign in with your new password.</FormMessage>
        </div>
      ) : null}
      <LoginForm next={next} googleEnabled={integrations.googleAuth} devMailbox={env.EMAIL_PROVIDER === "console"} />
    </AuthCard>
  );
}

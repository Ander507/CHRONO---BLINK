import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { safeRedirect } from "@/lib/validation";
import { env, integrations } from "@/server/env";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirect((await searchParams).next, "/");
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free forever. Earn XP, unlock achievements, climb leaderboards and save progress across devices."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-electric hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm next={next} googleEnabled={integrations.googleAuth} devMailbox={env.EMAIL_PROVIDER === "console"} />
    </AuthCard>
  );
}

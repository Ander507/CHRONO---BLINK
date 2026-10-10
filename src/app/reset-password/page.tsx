import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Choose a new password" subtitle="You'll need to sign in again on your other devices.">
      <ResetPasswordForm token={sp.error ? null : (sp.token ?? null)} />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
      footer={
        <Link href="/login" className="font-semibold text-electric hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm devMailbox={env.EMAIL_PROVIDER === "console"} />
    </AuthCard>
  );
}

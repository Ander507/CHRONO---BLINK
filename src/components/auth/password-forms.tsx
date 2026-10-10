"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Turnstile, captchaHeaders } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ForgotPasswordForm({ devMailbox }: { devMailbox: boolean }) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captcha, setCaptcha] = React.useState<string | null>(null);

  if (sent) {
    return (
      <FormMessage tone="success">
        If an account exists for {email}, a reset link is on its way. It expires in 30 minutes.
        {devMailbox ? (
          <>
            {" "}
            <Link href="/dev/mailbox" className="underline">
              Open dev mailbox
            </Link>
          </>
        ) : null}
      </FormMessage>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const res = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: "/reset-password",
          fetchOptions: { headers: captchaHeaders(captcha) },
        });
        setPending(false);
        // Same response whether or not the account exists (no user enumeration).
        if (res.error && res.error.status === 429) setError(authErrorMessage(res.error));
        else setSent(true);
      }}
    >
      <FormMessage>{error}</FormMessage>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Turnstile onToken={setCaptcha} />
      <Button type="submit" className="w-full" size="lg" disabled={pending || !email}>
        {pending ? <Loader2 className="animate-spin" /> : null} Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!token) return <FormMessage>This reset link is invalid or has expired. Request a new one.</FormMessage>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 10) return setError("Passwords need at least 10 characters.");
        if (password !== confirm) return setError("Passwords don't match.");
        setPending(true);
        const res = await authClient.resetPassword({ newPassword: password, token });
        setPending(false);
        if (res.error) return setError(authErrorMessage(res.error));
        router.push("/login?reset=1");
      }}
    >
      <FormMessage>{error}</FormMessage>
      <Field label="New password" htmlFor="password" hint="At least 10 characters">
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Set new password
      </Button>
    </form>
  );
}

"use client";

import { CheckCircle2, Loader2, MailCheck, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { GoogleIcon } from "@/components/auth/auth-card";
import { Turnstile, captchaHeaders } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input } from "@/components/ui/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { registerSchema, USERNAME_RE } from "@/lib/validation";

export function RegisterForm({ next, googleEnabled, devMailbox }: { next: string; googleEnabled: boolean; devMailbox: boolean }) {
  const [form, setForm] = React.useState({ name: "", username: "", email: "", password: "", acceptTerms: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const [available, setAvailable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const u = form.username.trim();
    if (!USERNAME_RE.test(u)) return;
    const t = setTimeout(async () => {
      const r = await authClient.isUsernameAvailable({ username: u }).catch(() => null);
      setAvailable(r?.data?.available ?? null);
    }, 350);
    return () => clearTimeout(t);
  }, [form.username]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (k === "username") setAvailable(null);
    setForm((f) => ({ ...f, [k]: k === "acceptTerms" ? e.target.checked : e.target.value }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setPending(true);
    const res = await authClient.signUp.email({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
      username: parsed.data.username,
      displayUsername: parsed.data.username,
      callbackURL: `/welcome?next=${encodeURIComponent(next)}`,
      fetchOptions: { headers: captchaHeaders(captcha) },
    });
    setPending(false);
    if (res.error) {
      setError(authErrorMessage(res.error));
      return;
    }
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" data-testid="register-success">
        <MailCheck className="mx-auto size-10 text-success" />
        <p className="font-display text-lg font-bold text-fg">Check your inbox</p>
        <p className="text-sm text-fg-muted">
          We sent a verification link to <span className="font-semibold text-fg">{sentTo}</span>. Click it to activate your account — the link
          expires in 24 hours.
        </p>
        {devMailbox ? (
          <Button asChild variant="secondary">
            <Link href="/dev/mailbox">Open dev mailbox</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {googleEnabled ? (
        <>
          <Button variant="secondary" className="w-full" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
            <GoogleIcon /> Sign up with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormMessage>{error}</FormMessage>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="name" error={errors.name}>
            <Input id="name" autoComplete="nickname" value={form.name} onChange={set("name")} maxLength={40} />
          </Field>
          <Field
            label="Username"
            htmlFor="username"
            error={errors.username ?? (available === false ? "That username is taken" : undefined)}
            hint={
              available ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-3" /> Available
                </span>
              ) : (
                "Letters, numbers, underscores"
              )
            }
          >
            <div className="relative">
              <Input id="username" autoComplete="username" value={form.username} onChange={set("username")} maxLength={24} />
              {available === false ? <XCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger" /> : null}
            </div>
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm text-fg-muted">
            <Checkbox checked={form.acceptTerms} onChange={set("acceptTerms")} className="mt-0.5" aria-describedby="terms-error" />
            <span>
              I agree to the{" "}
              <Link href="/legal/terms" className="text-electric hover:underline" target="_blank">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-electric hover:underline" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms ? (
            <p id="terms-error" className="mt-1.5 text-xs font-medium text-danger">
              {errors.acceptTerms}
            </p>
          ) : null}
        </div>
        <Turnstile onToken={setCaptcha} />
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Create account
        </Button>
      </form>
    </div>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { GoogleIcon } from "@/components/auth/auth-card";
import { Turnstile, captchaHeaders } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function LoginForm({ next, googleEnabled, devMailbox }: { next: string; googleEnabled: boolean; devMailbox: boolean }) {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [captcha, setCaptcha] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    const fetchOptions = { headers: captchaHeaders(captcha) };
    const id = identifier.trim();
    const res = id.includes("@")
      ? await authClient.signIn.email({ email: id, password, callbackURL: next, fetchOptions })
      : await authClient.signIn.username({ username: id, password, fetchOptions });
    setPending(false);
    if (res.error) {
      if (res.error.code === "EMAIL_NOT_VERIFIED") {
        setInfo("Your email isn't verified yet. We've sent a fresh verification link — check your inbox.");
        return;
      }
      setError(authErrorMessage(res.error));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {googleEnabled ? (
        <>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
          >
            <GoogleIcon /> Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormMessage>{error}</FormMessage>
        {info ? (
          <FormMessage tone="info">
            {info}
            {devMailbox ? (
              <>
                {" "}
                <Link href="/dev/mailbox" className="underline">
                  Open dev mailbox
                </Link>
              </>
            ) : null}
          </FormMessage>
        ) : null}
        <Field label="Email or username" htmlFor="identifier">
          <Input id="identifier" name="identifier" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs font-semibold text-fg-muted hover:text-fg">
            Forgot password?
          </Link>
        </div>
        <Turnstile onToken={setCaptcha} />
        <Button type="submit" className="w-full" size="lg" disabled={pending || !identifier || !password}>
          {pending ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
      </form>
    </div>
  );
}

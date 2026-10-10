import Link from "next/link";
import { LogoMark } from "@/components/brand";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col py-6 sm:py-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-56 rounded-full bg-electric/10 blur-3xl" aria-hidden />
        <div className="relative">
          <Link href="/" aria-label="ChronoBlink home">
            <LogoMark className="size-10" />
          </Link>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-fg">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div> : null}
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

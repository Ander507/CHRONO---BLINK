import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "primary" | "electric" | "success" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide [&_svg]:size-3",
        tone === "neutral" && "border-line-strong bg-raised text-fg-muted",
        tone === "primary" && "border-primary/30 bg-primary-soft text-primary-hover",
        tone === "electric" && "border-electric/30 bg-electric-soft text-electric",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("surface", className)} {...props} />;
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-raised", className)}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-electric transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-raised text-fg-muted [&_svg]:size-6">{icon}</div> : null}
      <p className="font-display text-lg font-bold text-fg">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-xl font-bold text-fg sm:text-2xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="tabular mt-1.5 font-display text-2xl font-bold text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

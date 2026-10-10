"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center" role="alert">
      <AlertTriangle className="size-10 text-warning" />
      <h1 className="mt-4 font-display text-2xl font-bold text-fg">Something went wrong</h1>
      <p className="mt-2 text-fg-muted">An unexpected error interrupted this page. You can try again — your progress is safe.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-fg-subtle">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}

import { Gamepad2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-raised text-fg-muted">
        <Gamepad2 className="size-8" />
      </div>
      <p className="mt-6 font-display text-6xl font-extrabold text-fg">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-fg">This page blinked out of existence</h1>
      <p className="mt-2 text-fg-muted">The game or page you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/">Back to the arcade</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/games">Browse games</Link>
        </Button>
      </div>
    </div>
  );
}

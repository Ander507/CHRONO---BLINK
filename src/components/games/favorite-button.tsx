"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { toggleFavorite } from "@/app/actions/favorites";
import { useConsent } from "@/components/consent";
import { trackPlatformEvent } from "@/lib/analytics-client";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  gameId,
  title,
  initial,
  signedIn,
  variant = "overlay",
  className,
}: {
  gameId: string;
  title: string;
  initial: boolean;
  signedIn: boolean;
  variant?: "overlay" | "toolbar";
  className?: string;
}) {
  const [fav, setFav] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const { consent } = useConsent();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      toast("Sign in to save favorites", {
        action: { label: "Sign in", onClick: () => router.push(`/login?next=${encodeURIComponent(pathname)}`) },
      });
      return;
    }
    const next = !fav;
    setFav(next);
    start(async () => {
      const r = await toggleFavorite(gameId, next);
      if (!r.ok) {
        setFav(!next);
        toast.error(r.error === "signin" ? "Please sign in again." : (r.error ?? "Couldn't update favorites"));
        return;
      }
      if (consent?.analytics) trackPlatformEvent(next ? "favorite_add" : "favorite_remove", gameId);
      toast.success(next ? `Added ${title} to favorites` : `Removed ${title} from favorites`);
    });
  }

  const label = fav ? `Remove ${title} from favorites` : `Add ${title} to favorites`;
  if (variant === "toolbar") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={fav}
        aria-label={label}
        title={label}
        className={cn(
          "grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-raised hover:text-fg",
          fav && "text-pink-400 hover:text-pink-300",
          className,
        )}
      >
        <Heart className={cn("size-5", fav && "fill-current")} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={fav}
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-ink/70 text-white/90 backdrop-blur transition hover:scale-105 hover:bg-ink/90",
        fav && "text-pink-400",
        className,
      )}
    >
      <Heart className={cn("size-4", fav && "fill-current")} />
    </button>
  );
}

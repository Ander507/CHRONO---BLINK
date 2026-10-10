"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
      <D.Content
        className={cn(
          "surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-[var(--shadow-lift)] focus:outline-none",
          className,
        )}
        {...props}
      >
        <D.Title className="pr-8 font-display text-xl font-bold text-fg">{title}</D.Title>
        {description ? <D.Description className="mt-1.5 text-sm text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-5">{children}</div>
        <D.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-fg-muted hover:bg-raised hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

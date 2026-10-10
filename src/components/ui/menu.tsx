"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={8}
        align="end"
        className={cn(
          "surface z-50 min-w-56 overflow-hidden p-1.5 shadow-[var(--shadow-lift)] data-[state=open]:animate-[fade-up_0.15s_ease-out]",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1.5 h-px bg-line" />;
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs text-fg-subtle", className)} {...props} />;
}

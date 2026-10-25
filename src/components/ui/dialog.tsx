"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-900/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
  );
}

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description?: ReactNode;
  hideTitle?: boolean;
}

export function DialogContent({ className, children, title, description, hideTitle, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-overlay)] focus:outline-none",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className={cn("font-display text-lg font-bold", hideTitle && "sr-only")}>
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted hover:bg-soft hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  side?: "left" | "right";
}

/** Side drawer built on the accessible dialog primitive (focus trap, Esc, aria). */
export function SheetContent({ className, children, title, side = "left", ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[86vw] max-w-sm flex-col bg-surface shadow-[var(--shadow-overlay)] focus:outline-none",
          side === "left" ? "left-0 border-r border-line" : "right-0 border-l border-line",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <DialogPrimitive.Title className="font-display text-base font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          <DialogPrimitive.Close
            className="rounded-md p-1.5 text-ink-muted hover:bg-soft hover:text-ink"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

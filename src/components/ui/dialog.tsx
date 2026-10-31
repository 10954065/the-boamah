"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type InteractOutside = NonNullable<ComponentProps<typeof DialogPrimitive.Content>["onInteractOutside"]>;

/** Taps on the till's on-screen keyboard (components/pos/onscreen-keyboard.tsx) are typing, not a tap outside. */
function keepForKeyboard(handler?: InteractOutside): InteractOutside {
  return (event) => {
    const target = event.detail.originalEvent.target;
    if (target instanceof Element && target.closest("[data-onscreen-keyboard]")) return event.preventDefault();
    handler?.(event);
  };
}

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-900/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
  );
}

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description?: ReactNode;
  hideTitle?: boolean;
  /** For dialogs that must not be dismissed, e.g. while a till sale is being saved. */
  hideClose?: boolean;
}

export function DialogContent({ className, children, title, description, hideTitle, hideClose, onInteractOutside, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-dialog="center"
        onInteractOutside={keepForKeyboard(onInteractOutside)}
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
        <div className={cn(!hideTitle && "mt-4")}>{children}</div>
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted hover:bg-soft hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  side?: "left" | "right";
  closeLabel?: string;
  /** Pinned below the scrolling body, e.g. totals and buttons. */
  footer?: ReactNode;
}

/** Side drawer built on the accessible dialog primitive (focus trap, Esc, aria). */
export function SheetContent({ className, children, title, side = "left", closeLabel = "Close menu", footer, onInteractOutside, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-dialog="sheet"
        onInteractOutside={keepForKeyboard(onInteractOutside)}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[86vw] max-w-sm flex-col bg-surface shadow-[var(--shadow-overlay)] focus:outline-none",
          side === "left"
            ? "left-0 border-r border-line data-[state=open]:animate-[sheet-in-left_220ms_cubic-bezier(0.22,1,0.36,1)]"
            : "right-0 border-l border-line data-[state=open]:animate-[sheet-in-right_220ms_cubic-bezier(0.22,1,0.36,1)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <DialogPrimitive.Title className="font-display text-base font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          <DialogPrimitive.Close
            className="rounded-md p-1.5 text-ink-muted hover:bg-soft hover:text-ink"
            aria-label={closeLabel}
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-line bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

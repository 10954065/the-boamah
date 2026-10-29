"use client";

import { useState, useSyncExternalStore, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Wifi, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

export function formatTime(value: string | Date): string {
  return timeFormatter.format(new Date(value));
}

function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the device has a network connection (not a guarantee the server answers). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
}

interface TillHeaderProps {
  till: { code: string; name: string };
  cashierName: string;
  shiftOpenedAt?: string | null;
  children?: ReactNode;
}

/** The till's top bar: which till, who is signed in, the connection, and the actions on the right. */
export function TillHeader({ till, cashierName, shiftOpenedAt, children }: TillHeaderProps) {
  const online = useOnline();
  return (
    <header className="flex items-center gap-3 bg-brand-900 px-3 py-2 text-white">
      <LogoMark className="hidden h-8 w-8 shrink-0 sm:block" />
      <div className="min-w-0">
        <p className="truncate font-display text-[15px] font-extrabold leading-tight">
          Till {till.code} · {till.name}
        </p>
        <p className="truncate text-xs text-white/70">
          {cashierName}
          {shiftOpenedAt ? ` · Shift since ${formatTime(shiftOpenedAt)}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          online ? "bg-leaf-500/20 text-leaf-100" : "bg-danger text-white",
        )}
      >
        {online ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="sr-only sm:not-sr-only">{online ? "Online" : "Offline"}</span>
      </span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}

interface HeaderActionProps extends ComponentProps<"button"> {
  icon: typeof LogOut;
  label: string;
}

/** A header button: icon only on small screens, with its label from medium screens up. */
export function HeaderAction({ icon: Icon, label, className, ...props }: HeaderActionProps) {
  return (
    <button
      type="button"
      title={label}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only xl:not-sr-only">{label}</span>
    </button>
  );
}

/** Signs out and returns to the till's sign in page. */
export function TillSignOut({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <HeaderAction
      icon={LogOut}
      label={failed ? "Sign out failed, try again" : "Sign out"}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const { error } = await authClient.signOut();
          if (error) return setFailed(true);
          router.replace("/pos/login");
          router.refresh();
        })
      }
    />
  );
}

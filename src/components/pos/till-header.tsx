"use client";

import { useState, useSyncExternalStore, useTransition, type ComponentProps, type ReactNode } from "react";
import { CloudOff, LogOut, Wifi, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { clearTillCaches } from "./till-offline";
import { saveLastReceipt } from "./till-storage";
import { useOutbox, useSyncState } from "./till-sync";

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

function subscribeToMinutes(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

/** The current minute (milliseconds since 1970 divided by 60,000), for screens that change with the time. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribeToMinutes, () => Math.floor(Date.now() / 60_000), () => 0);
}

const CONNECTION = {
  online: { icon: Wifi, label: "Online", className: "bg-leaf-500/20 text-leaf-100" },
  unreachable: { icon: CloudOff, label: "No connection", className: "bg-gold-500 text-brand-900" },
  offline: { icon: WifiOff, label: "Offline", className: "bg-danger text-white" },
};

/** Online, offline, or connected to a network that cannot reach the shop's system. */
function useConnection(): keyof typeof CONNECTION {
  const online = useOnline();
  const { failure } = useSyncState();
  if (!online) return "offline";
  return failure?.kind === "offline" ? "unreachable" : "online";
}

interface TillHeaderProps {
  till: { code: string; name: string };
  cashierName: string;
  shiftOpenedAt?: string | null;
  /** What is waiting to be sent, next to the connection. */
  status?: ReactNode;
  children?: ReactNode;
}

/** The till's top bar: which till, who is signed in, the connection, and the actions on the right. */
export function TillHeader({ till, cashierName, shiftOpenedAt, status, children }: TillHeaderProps) {
  const connection = CONNECTION[useConnection()];
  return (
    <header className="flex items-center gap-2 bg-brand-900 px-2 py-1 text-white sm:gap-3 sm:px-3">
      <LogoMark className="hidden h-7 w-7 shrink-0 sm:block" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-extrabold leading-tight">
          Till {till.code} · {till.name}
        </p>
        <p className="truncate text-[11px] leading-4 text-white/70">
          {cashierName}
          {shiftOpenedAt ? ` · Shift since ${formatTime(shiftOpenedAt)}` : ""}
        </p>
      </div>
      <span className={cn("ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", connection.className)}>
        <connection.icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{connection.label}</span>
      </span>
      {status}
      <div className="ml-auto flex shrink-0 items-center">{children}</div>
    </header>
  );
}

interface HeaderActionProps extends ComponentProps<"button"> {
  icon: typeof LogOut;
  label: string;
}

/** A header button: icon only on small screens, with its label from medium screens up. Children (a count) show beside the icon. */
export function HeaderAction({ icon: Icon, label, className, children, ...props }: HeaderActionProps) {
  return (
    <button
      type="button"
      title={label}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
      <span className="sr-only xl:not-sr-only">{label}</span>
    </button>
  );
}

interface TillSignOutProps {
  tillCode: string;
  cashierId: string;
  disabled?: boolean;
}

/**
 * Signs out and returns to the till's sign in page. Needs the internet. If
 * the cashier still has entries waiting, they are asked first: those wait on
 * the till until the same cashier signs in here again.
 */
export function TillSignOut({ tillCode, cashierId, disabled }: TillSignOutProps) {
  const online = useOnline();
  const waiting = useOutbox(tillCode).filter((entry) => entry.cashierId === cashierId).length;
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function signOut() {
    setConfirming(false);
    startTransition(async () => {
      const { error } = await authClient.signOut();
      if (error) return setFailed(true);
      await clearTillCaches();
      saveLastReceipt(tillCode, null);
      // A full page load, so the offline helper sees the sign in page and forgets the saved till.
      window.location.replace("/pos/login");
    });
  }

  const label = !online ? "Signing out needs the internet" : failed ? "Sign out failed, try again" : "Sign out";
  return (
    <>
      <HeaderAction icon={LogOut} label={label} disabled={disabled || pending || !online} onClick={() => (waiting > 0 ? setConfirming(true) : signOut())} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        {confirming ? (
          <DialogContent title="Sign out with sales still to send?" className="max-w-md">
            <p className="text-sm leading-6 text-ink-muted">
              {waiting} {waiting === 1 ? "item has" : "items have"} not reached the shop&apos;s system yet. They stay safely on this till and are sent next time you sign
              in here.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirming(false)} autoFocus>
                Stay signed in
              </Button>
              <Button variant="danger" size="lg" className="flex-1" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

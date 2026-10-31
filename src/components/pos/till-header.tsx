"use client";

import { useState, useSyncExternalStore, useTransition, type ComponentProps, type ReactNode } from "react";
import { CloudOff, Keyboard, LogOut, Maximize, Minimize, Wifi, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { clearTillCaches } from "./till-offline";
import { setDeviceSetting, toggleFullScreen, useDeviceSetting, useFullScreen } from "./till-device";
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
  /** The till's actions (HeaderAction buttons). */
  children?: ReactNode;
  /** Signing out, kept apart at the end. */
  footer?: ReactNode;
}

/**
 * The till's menu: a bar across the top on phones, and down the left side
 * from tablets up, as icons until the screen is wide enough for words.
 */
export function TillHeader({ till, cashierName, shiftOpenedAt, status, children, footer }: TillHeaderProps) {
  const connection = CONNECTION[useConnection()];
  const since = shiftOpenedAt ? `Shift since ${formatTime(shiftOpenedAt)}` : "No shift open";
  return (
    <header className="flex shrink-0 items-center gap-2 bg-brand-900 px-2 py-1 text-white sm:gap-3 sm:px-3 md:w-[4.75rem] md:flex-col md:items-stretch md:gap-1 md:overflow-y-auto md:px-2 md:py-3 xl:w-56 xl:px-3">
      <div className="flex min-w-0 items-center gap-2.5 md:mb-3 md:justify-center xl:justify-start">
        <LogoMark className="hidden h-7 w-7 shrink-0 sm:block md:h-10 md:w-10" />
        <div className="min-w-0 md:hidden xl:block">
          <p className="truncate font-display text-sm font-extrabold leading-tight xl:text-base">
            <span className="xl:hidden">
              Till {till.code} · {till.name}
            </span>
            <span className="hidden xl:inline">The Boamah&apos;s</span>
          </p>
          <p className="truncate text-[11px] leading-4 text-white/70">
            <span className="xl:hidden">
              {cashierName} · {since}
            </span>
            <span className="hidden xl:inline">Till {till.code} · {till.name}</span>
          </p>
        </div>
      </div>

      <nav aria-label="Till" className="order-3 ml-auto flex shrink-0 items-center md:order-none md:ml-0 md:flex-col md:items-stretch md:gap-0.5">
        {children}
      </nav>

      <div className="flex min-w-0 shrink-0 items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:border-t md:border-white/10 md:pt-3">
        <div className="hidden items-center gap-2.5 md:flex md:justify-center xl:justify-start" title={`${cashierName}, ${since.toLowerCase()}`}>
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 font-display text-sm font-extrabold">
            {cashierName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="hidden min-w-0 xl:block">
            <span className="block truncate text-sm font-semibold leading-tight">{cashierName}</span>
            <span className="block truncate text-[11px] leading-4 text-white/70">{since}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 md:flex-col md:items-center xl:flex-row xl:flex-wrap xl:items-center [&>button]:max-w-full [&>button]:whitespace-normal [&>button]:text-center">
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", connection.className)} title={connection.label}>
            <connection.icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only md:sr-only xl:not-sr-only">{connection.label}</span>
          </span>
          {status}
        </div>
      </div>

      <div className="order-4 flex shrink-0 items-center md:order-none md:flex-col md:items-stretch">
        <DeviceActions />
        {footer}
      </div>
    </header>
  );
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

/** The page title above the work, from tablets up, with the shop's clock. */
export function TillTitle({ title, detail }: { title: string; detail: string }) {
  const minute = useMinuteClock();
  const now = minute > 0 ? new Date(minute * 60_000) : null;
  return (
    <div className="hidden h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 md:flex">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-extrabold leading-tight">{title}</h1>
        <p className="truncate text-xs text-ink-muted">{detail}</p>
      </div>
      {now ? (
        <p className="shrink-0 text-right leading-tight">
          <span className="block font-display text-lg font-extrabold tabular-nums">{formatTime(now)}</span>
          <span className="block text-xs text-ink-muted">{dayFormatter.format(now)}</span>
        </p>
      ) : null}
    </div>
  );
}

interface HeaderActionProps extends ComponentProps<"button"> {
  icon: typeof LogOut;
  /** What the button does, read out and shown on hover. */
  label: string;
  /** The words beside the icon on wide screens, when shorter than the label. */
  text?: string;
  /** A number to flag, such as sales on hold. */
  count?: number;
  /** The screen this button shows is the one open. */
  active?: boolean;
  /** For a switch, whether it is on. Shown the same way as the open screen. */
  pressed?: boolean;
}

/** A menu button: an icon on phones and tablets, an icon with words on wide screens. */
export function HeaderAction({ icon: Icon, label, text, count = 0, active = false, pressed, className, ...props }: HeaderActionProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40",
        "md:h-10 md:w-full md:justify-center md:px-0 xl:justify-start xl:gap-3 xl:px-3 xl:text-sm",
        (active || pressed) && "bg-white/15 text-white before:absolute before:inset-y-2 before:left-0 before:hidden before:w-1 before:rounded-full before:bg-gold-400 md:before:block",
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0 md:h-5 md:w-5 xl:h-[1.125rem] xl:w-[1.125rem]" aria-hidden="true" />
      <span className="hidden truncate xl:inline">{text ?? label}</span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-brand-900 md:right-2 md:top-1 xl:static xl:ml-auto xl:h-5 xl:min-w-5 xl:text-[11px]"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

/** Full screen and the on-screen keyboard, for the counter device. Phones have their own keyboard and bars. */
function DeviceActions() {
  const fullScreen = useFullScreen();
  const keyboard = useDeviceSetting("keyboard");
  return (
    <>
      {fullScreen === null ? null : (
        <HeaderAction
          icon={fullScreen ? Minimize : Maximize}
          label="Full screen"
          pressed={fullScreen}
          className="hidden md:inline-flex"
          onClick={toggleFullScreen}
        />
      )}
      <HeaderAction
        icon={Keyboard}
        label="On-screen keyboard"
        text="Keyboard"
        pressed={keyboard}
        className="hidden md:inline-flex"
        onClick={() => setDeviceSetting("keyboard", !keyboard)}
      />
    </>
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
      <HeaderAction icon={LogOut} label={label} text="Sign out" disabled={disabled || pending || !online} onClick={() => (waiting > 0 ? setConfirming(true) : signOut())} />
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

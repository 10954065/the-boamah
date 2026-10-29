"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import type { PosShiftView } from "@/lib/pos";
import { newEntryState, type OutboxEntry } from "@/lib/pos-outbox";
import { cn } from "@/lib/utils";
import type { TillCashier } from "./sell-screen";
import { formatTime, useOnline } from "./till-header";
import { dismissNotice, removeFromOutbox, updateOutbox } from "./till-storage";
import { requestSync, useNotices, useOutbox, useSyncState, useUnreadableCount } from "./till-sync";

/** One line describing an entry, for staff. */
function describe(entry: OutboxEntry): string {
  if (entry.kind === "sale") return `Receipt ${entry.receipt.receiptNumber} · ${formatMoney(entry.receipt.totalMinor)} · ${formatTime(entry.upload.soldAt)}`;
  if (entry.kind === "shift-open") return `Shift opened at ${formatTime(entry.shift.openedAt)} with ${formatMoney(entry.shift.openingFloatMinor)}`;
  return `Shift closed at ${formatTime(entry.input.closedAt)}`;
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** Other cashiers' entries, by name. */
function othersByName(entries: readonly OutboxEntry[], cashierId: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.cashierId !== cashierId) counts.set(entry.cashierName, (counts.get(entry.cashierName) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

interface OutboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tillCode: string;
  cashier: TillCashier;
}

/** Everything on the till that the shop's system has not confirmed, with what can be done about it. */
export function OutboxDialog({ open, onOpenChange, tillCode, cashier }: OutboxDialogProps) {
  const entries = useOutbox(tillCode);
  const online = useOnline();
  const { syncing, failure, lastAttemptAt } = useSyncState();
  const [removing, setRemoving] = useState<string | null>(null);
  const own = entries.filter((entry) => entry.cashierId === cashier.id);
  const ownWaiting = own.filter((entry) => entry.status === "waiting").length;
  const others = othersByName(entries, cashier.id);

  function tryAgain(entry: OutboxEntry) {
    updateOutbox(tillCode, (list) => list.map((current) => (current.id === entry.id ? { ...current, ...newEntryState } : current)));
    void requestSync(tillCode, cashier.id);
  }

  function remove(entry: OutboxEntry) {
    if (removing !== entry.id) return setRemoving(entry.id);
    setRemoving(null);
    removeFromOutbox(tillCode, entry.id);
  }

  const status = syncing
    ? "Sending now."
    : failure && ownWaiting > 0
      ? `Last tried at ${formatTime(lastAttemptAt ?? new Date())}: ${failure.message}`
      : ownWaiting > 0
        ? online
          ? "Waiting to be sent."
          : "Waiting for the internet connection."
        : "Everything from you has been sent.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent title="Waiting to send" description="Saved on this till until the shop's system confirms it." className="max-w-lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className="min-w-0 flex-1 text-sm text-ink-muted">
                {status}
              </p>
              {failure?.kind === "signed-out" && ownWaiting > 0 ? (
                <Button asChild size="sm">
                  <Link href="/pos/login">Sign in again</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!online || syncing || ownWaiting === 0} onClick={() => void requestSync(tillCode, cashier.id)}>
                  <RefreshCw className={cn(syncing && "animate-spin motion-reduce:animate-none")} /> Send now
                </Button>
              )}
            </div>

            {own.length > 0 ? (
              <ul className="max-h-[45dvh] divide-y divide-line overflow-y-auto rounded-md border border-line">
                {own.map((entry) => (
                  <li key={entry.id} className="px-3 py-2 text-sm">
                    <p className="font-semibold tabular-nums">{describe(entry)}</p>
                    {entry.status === "waiting" ? (
                      <p className="text-xs text-ink-muted">Waiting</p>
                    ) : (
                      <div className="mt-1 space-y-2">
                        <p className="text-xs text-danger">Not accepted: {entry.error}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={!online} onClick={() => tryAgain(entry)}>
                            Try again
                          </Button>
                          {cashier.canManage ? (
                            <Button size="sm" variant={removing === entry.id ? "danger" : "ghost"} onClick={() => remove(entry)}>
                              {removing === entry.id ? "Remove it for good" : "Remove"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            {others.map(({ name, count }) => (
              <p key={name} className="rounded-md bg-soft px-3 py-2 text-sm text-ink-muted">
                {countLabel(count)} from {name} {count === 1 ? "is" : "are"} waiting. Only {name} can send {count === 1 ? "it" : "them"}, by signing in on this till.
              </p>
            ))}

            {own.some((entry) => entry.status === "refused") ? (
              <p className="text-xs leading-5 text-ink-muted">
                Items the shop&apos;s system did not accept stay here for a manager. Put the reason right (for example switch the till back on), then press Try again.
              </p>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** The top bar's count of what is waiting to be sent. Opens the list. */
export function SyncStatus({ tillCode, cashier }: { tillCode: string; cashier: TillCashier }) {
  const entries = useOutbox(tillCode);
  const { syncing } = useSyncState();
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const own = entries.filter((entry) => entry.cashierId === cashier.id);
  const refused = own.filter((entry) => entry.status === "refused").length;
  const label = refused > 0 ? `${refused} not accepted` : own.length > 0 ? `${own.length} to send` : `${entries.length} waiting`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          refused > 0 ? "bg-danger text-white hover:bg-danger/90" : "bg-white/15 text-white hover:bg-white/25",
        )}
      >
        {refused > 0 ? (
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        ) : syncing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {label}
      </button>
      <OutboxDialog open={open} onOpenChange={setOpen} tillCode={tillCode} cashier={cashier} />
    </>
  );
}

interface TillBannerProps {
  tillCode: string;
  cashier: TillCashier;
  /** The shift on screen, if any. */
  shift: PosShiftView | null;
  /** When the prices on screen were sent by the shop's system. */
  pricesAsOf?: string | null;
  /** A manager closed the shift while the till was offline: start a new one. The server's time of that answer. */
  onShiftClosedElsewhere?: (serverTime: string) => void;
  /** Shown when nothing more pressing is. */
  children?: ReactNode;
}

const bannerClass = "flex flex-wrap items-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-sm text-warning";

/** The most pressing thing about the connection and the outbox, under the top bar. */
export function TillBanner({ tillCode, cashier, shift, pricesAsOf, onShiftClosedElsewhere, children }: TillBannerProps) {
  const entries = useOutbox(tillCode);
  const unreadable = useUnreadableCount(tillCode);
  const notices = useNotices(tillCode);
  const online = useOnline();
  const { failure } = useSyncState();
  const [listOpen, setListOpen] = useState(false);
  const own = entries.filter((entry) => entry.cashierId === cashier.id);
  const refused = own.filter((entry) => entry.status === "refused");
  const closedElsewhere = shift
    ? refused.find((entry) => entry.kind === "sale" && entry.reason === "shift-closed" && entry.upload.shiftClientId === shift.clientId)
    : undefined;
  const others = othersByName(entries, cashier.id);
  const notice = notices.at(-1);

  let banner: ReactNode = children ?? null;
  if (unreadable > 0) {
    banner = (
      <p role="alert" className={cn(bannerClass, "bg-danger-soft text-danger")}>
        {countLabel(unreadable)} saved on this till could not be read by this version of the till. {unreadable === 1 ? "It is" : "They are"} kept: do not clear the
        browser&apos;s data, and tell a manager.
      </p>
    );
  } else if (closedElsewhere && onShiftClosedElsewhere) {
    banner = (
      <div role="alert" className={cn(bannerClass, "bg-danger-soft text-danger")}>
        <p>A manager closed this shift, so sales made after that were not accepted. Start a new shift to carry on.</p>
        <Button size="sm" onClick={() => onShiftClosedElsewhere(closedElsewhere.refusedAt ?? new Date().toISOString())}>
          Start a new shift
        </Button>
      </div>
    );
  } else if (!online) {
    banner = (
      <p role="status" className={bannerClass}>
        No internet connection. Sales are saved on this till and sent by themselves when the connection is back.
        {pricesAsOf ? ` Prices and stock as at ${formatTime(pricesAsOf)}.` : ""}
      </p>
    );
  } else if (failure?.kind === "signed-out" && own.length > 0) {
    banner = (
      <div role="alert" className={bannerClass}>
        <p>You have been signed out, so {countLabel(own.length)} on this till cannot be sent.</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/pos/login">Sign in again</Link>
        </Button>
      </div>
    );
  } else if (refused.length > 0) {
    banner = (
      <div role="alert" className={cn(bannerClass, "bg-danger-soft text-danger")}>
        <p>{countLabel(refused.length)} from this till {refused.length === 1 ? "was" : "were"} not accepted by the shop&apos;s system. A manager needs to look.</p>
        <Button size="sm" variant="outline" onClick={() => setListOpen(true)}>
          See why
        </Button>
      </div>
    );
  } else if (notice) {
    banner = (
      <div role="status" className={bannerClass}>
        <p>
          Receipt {notice.printed} was saved as {notice.recorded}, because another device had used that number. If the customer comes back, look the sale up by{" "}
          {notice.recorded}.
        </p>
        <Button size="sm" variant="outline" onClick={() => dismissNotice(tillCode, notice.id)}>
          OK
        </Button>
      </div>
    );
  } else if (others.length > 0) {
    banner = (
      <p role="status" className={bannerClass}>
        {others.map(({ name, count }) => `${countLabel(count)} from ${name}`).join(", ")} still to send. Only that cashier can send them, by signing in on this till.
      </p>
    );
  }

  return (
    <>
      {banner}
      <OutboxDialog open={listOpen} onOpenChange={setListOpen} tillCode={tillCode} cashier={cashier} />
    </>
  );
}

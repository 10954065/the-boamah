"use client";

import { useState, type FormEvent } from "react";
import { PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import type { HeldSale } from "@/lib/pos-till";
import { formatTime } from "./till-header";
import { removeHeldSale } from "./till-storage";
import { useHeldSales } from "./till-sync";

interface HoldSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  totalMinor: number;
  onHold: (note: string) => void;
}

/** Puts the sale on screen aside, with a note of who it is for, so the next customer can be served. */
export function HoldSaleDialog({ open, onOpenChange, itemCount, totalMinor, onHold }: HoldSaleDialogProps) {
  const [note, setNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onHold(note);
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="Put this sale on hold"
          description={`${itemCount} ${itemCount === 1 ? "item" : "items"} for ${formatMoney(totalMinor)}. Nothing is paid or taken off stock until it is charged.`}
          className="max-w-md"
        >
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="hold-note" className="mb-1 block text-sm font-semibold">
                Who is it for? (optional)
              </label>
              <Input id="hold-note" maxLength={60} autoComplete="off" autoFocus placeholder="For example: Ama, blue bag" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <Button type="submit" size="lg" className="w-full">
              <PauseCircle /> Put on hold
            </Button>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface HeldSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tillCode: string;
  /** Picking one up needs the sale on screen to be empty. */
  canPickUp: boolean;
  onPickUp: (held: HeldSale) => void;
}

/** The sales on hold on this till, oldest first, to pick up again or discard. Any cashier on this till can. */
export function HeldSalesDialog({ open, onOpenChange, tillCode, canPickUp, onPickUp }: HeldSalesDialogProps) {
  const held = useHeldSales(tillCode);
  const [discarding, setDiscarding] = useState<string | null>(null);

  function discard(id: string) {
    if (discarding !== id) return setDiscarding(id);
    setDiscarding(null);
    removeHeldSale(tillCode, id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent title="Sales on hold" description="Prices are checked again when a sale is picked up." className="max-w-lg">
          {held.length === 0 ? (
            <p className="text-sm text-ink-muted">No sales are on hold.</p>
          ) : (
            <div className="space-y-3">
              {canPickUp ? null : (
                <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                  Finish, hold or clear the sale on screen first.
                </p>
              )}
              <ul className="max-h-[55dvh] divide-y divide-line overflow-y-auto rounded-md border border-line">
                {held.map((sale) => {
                  const items = sale.lines.length;
                  return (
                    <li key={sale.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{sale.note ?? `Held at ${formatTime(sale.heldAt)}`}</p>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {items} {items === 1 ? "item" : "items"} · {formatMoney(sale.totalMinor)} · {sale.cashierName} at {formatTime(sale.heldAt)}
                        </p>
                      </div>
                      <Button size="sm" variant={discarding === sale.id ? "danger" : "ghost"} onBlur={() => setDiscarding(null)} onClick={() => discard(sale.id)}>
                        {discarding === sale.id ? "Tap again to discard" : "Discard"}
                      </Button>
                      <Button size="sm" disabled={!canPickUp} onClick={() => onPickUp(sale)}>
                        Pick up
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

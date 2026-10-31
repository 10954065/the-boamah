"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { isWeighed, parseTillQuantity, pressKey, priceSale, type PosCatalogItem } from "@/lib/pos-till";
import { effectiveUnitPrice } from "@/lib/pricing";
import { milliToDecimalString, UNIT_INFO } from "@/lib/quantity";
import { Keypad } from "./keypad";

/** The item to weigh or count; quantityMilli is set when changing a line already on the sale. */
export interface QuantityTarget {
  item: PosCatalogItem;
  quantityMilli: number | null;
}

interface QuantityDialogProps {
  target: QuantityTarget | null;
  onClose: () => void;
  onConfirm: (item: PosCatalogItem, quantityMilli: number) => void;
  onRemove: (variantId: string) => void;
}

export function QuantityDialog({ target, onClose, onConfirm, onRemove }: QuantityDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target ? <QuantityForm key={target.item.variantId} target={target} onConfirm={onConfirm} onRemove={onRemove} /> : null}
    </Dialog>
  );
}

function QuantityForm({ target, onConfirm, onRemove }: { target: QuantityTarget } & Pick<QuantityDialogProps, "onConfirm" | "onRemove">) {
  const { item } = target;
  const weighed = isWeighed(item.unit);
  const [text, setText] = useState(target.quantityMilli ? milliToDecimalString(target.quantityMilli) : "");
  const [now] = useState(() => new Date());
  const quantityMilli = parseTillQuantity(text, item.unit);
  const line = quantityMilli ? priceSale([{ item, quantityMilli }], now).lines[0] : undefined;
  const unitWord = UNIT_INFO[item.unit].plural;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (quantityMilli) onConfirm(item, quantityMilli);
  }

  let hint = "";
  if (line) hint = `Line total ${formatMoney(line.lineTotalMinor)}${line.priceNote === "bulk" ? " at the bulk price" : ""}`;
  else if (text) hint = weighed ? `Enter the weight in ${unitWord}, for example 1.25` : "Enter a whole number";

  return (
    <DialogContent
      title={weighed ? `Weigh ${item.productName}` : item.productName}
      description={`${item.variantName} · ${formatMoney(effectiveUnitPrice(item, now))} ${UNIT_INFO[item.unit].per}`}
      className="max-w-sm"
    >
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="till-quantity" className="block text-sm font-semibold">
          {weighed ? `Weight in ${unitWord}` : "Quantity"}
        </label>
        <div className="relative">
          <Input
            id="till-quantity"
            data-keyboard="none"
            autoFocus
            autoComplete="off"
            inputMode="decimal"
            value={text}
            onChange={(event) => setText(event.target.value.replace(/[^\d.]/g, ""))}
            aria-invalid={text !== "" && !quantityMilli}
            aria-describedby="till-quantity-hint"
            className="h-14 pr-16 text-2xl font-bold tabular-nums"
          />
          {weighed ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">{unitWord}</span> : null}
        </div>
        <p id="till-quantity-hint" aria-live="polite" className="min-h-5 text-sm text-ink-muted">
          {hint}
        </p>
        <Keypad decimals={weighed} onKey={(key) => setText((value) => pressKey(value, key, weighed ? 3 : 0))} />
        <div className="flex gap-2 pt-1">
          {target.quantityMilli ? (
            <Button variant="outline" size="lg" onClick={() => onRemove(item.variantId)}>
              Remove
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="flex-1" disabled={!quantityMilli}>
            {target.quantityMilli ? "Update" : "Add to sale"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/input";
import type { ReceiptData } from "@/lib/pos-till";
import { cn } from "@/lib/utils";
import { PrintArea, ReceiptDocument, type ShopDetails } from "./receipt";
import type { PaperWidth, TillPrefs } from "./till-storage";

const PAPER_OPTIONS: { value: PaperWidth; label: string; hint: string }[] = [
  { value: "80", label: "80 mm roll", hint: "Most counter printers" },
  { value: "58", label: "58 mm roll", hint: "Small and portable printers" },
];

function testReceipt(tillCode: string, cashierName: string, at: string): ReceiptData {
  return {
    receiptNumber: "TEST PRINT",
    soldAt: at,
    tillCode,
    cashierName,
    lines: [{ name: "Test line", detail: "Check nothing is cut off at the edges", unit: "ITEM", quantityMilli: 1000, unitPriceMinor: 0, lineTotalMinor: 0, savingMinor: 0 }],
    totalMinor: 0,
    savingMinor: 0,
    payments: [],
    paidMinor: 0,
    changeMinor: 0,
  };
}

interface TillSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: TillPrefs;
  onChange: (prefs: TillPrefs) => void;
  shop: ShopDetails;
  tillCode: string;
  cashierName: string;
  openedAt: string;
}

/** Receipt printer settings for this device. */
export function TillSettingsDialog({ open, onOpenChange, prefs, onChange, shop, tillCode, cashierName, openedAt }: TillSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent title="Receipt printer" description="These settings are kept on this device." className="max-w-md">
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Paper width</legend>
              <div className="grid grid-cols-2 gap-2">
                {PAPER_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      prefs.paper === option.value ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong hover:bg-soft",
                    )}
                  >
                    <input
                      type="radio"
                      name="till-paper"
                      value={option.value}
                      checked={prefs.paper === option.value}
                      onChange={() => onChange({ ...prefs, paper: option.value })}
                      className="sr-only"
                    />
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-xs text-ink-muted">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" checked={prefs.autoPrint} onChange={(event) => onChange({ ...prefs, autoPrint: event.target.checked })} />
              <span>
                <span className="block font-semibold">Print every receipt straight away</span>
                <span className="block text-ink-muted">Otherwise the receipt shows on screen with a Print button.</span>
              </span>
            </label>

            <div className="rounded-md bg-soft px-3 py-2.5 text-sm text-ink-muted">
              <p className="font-semibold text-ink">Setting up the printer</p>
              <p className="mt-1">
                Choose the receipt printer in the print window, set its paper to the roll size above and turn margins off. Print a test to check the edges.
              </p>
            </div>

            <Button variant="outline" size="lg" className="w-full" onClick={() => window.print()}>
              <Printer /> Print a test receipt
            </Button>
          </div>
          <PrintArea>
            <ReceiptDocument receipt={testReceipt(tillCode, cashierName, openedAt)} shop={shop} paper={prefs.paper} />
          </PrintArea>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

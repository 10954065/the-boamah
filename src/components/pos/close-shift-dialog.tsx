"use client";

import { useState, type FormEvent } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { formatMoney, parseDecimalToMinor } from "@/lib/money";
import { countDifferences, POS_TENDER_LABELS, POS_TENDERS, type PosTenderCode, type ShiftSummary } from "@/lib/pos";
import { cn } from "@/lib/utils";
import type { PosShiftView } from "@/server/pos/shifts";
import { differenceLabel, PrintArea, ShiftReportDocument, type ShopDetails } from "./receipt";
import { failureOf, tillApi } from "./till-api";
import type { PaperWidth } from "./till-storage";

const COUNT_FIELDS: { method: PosTenderCode; label: string; hint: string }[] = [
  { method: "CASH", label: "Cash in the drawer", hint: "Count everything, including the opening float." },
  { method: "MOMO", label: "Mobile money received", hint: "The total on the mobile money statement for this shift." },
  { method: "CARD", label: "Card payments", hint: "The total on the card machine's end of day slip." },
];

interface CloseShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: PosShiftView;
  shop: ShopDetails;
  paper: PaperWidth;
  /** Called once the shift is closed and the cashier has finished with the report. */
  onClosed: () => void;
}

/**
 * Closing a shift: the cashier counts first (without seeing what is
 * expected), then sees the report of expected against counted.
 */
export function CloseShiftDialog({ open, onOpenChange, shift, shop, paper, onClosed }: CloseShiftDialogProps) {
  const [report, setReport] = useState<{ shift: PosShiftView; summary: ShiftSummary } | null>(null);

  function finish() {
    setReport(null);
    onClosed();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (report && !next ? finish() : onOpenChange(next))}>
      {open ? (
        <DialogContent title={report ? "Shift closed" : "Close the shift"} description={report ? undefined : `${shift.cashierName}'s shift on till ${shift.tillCode}`} className="max-w-lg">
          {report ? <ShiftReport report={report} shop={shop} paper={paper} onDone={finish} /> : <CountForm shift={shift} onClosed={setReport} />}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function CountForm({ shift, onClosed }: { shift: PosShiftView; onClosed: (report: { shift: PosShiftView; summary: ShiftSummary }) => void }) {
  const [counts, setCounts] = useState<Record<PosTenderCode, string>>({ CASH: "", MOMO: "", CARD: "" });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = POS_TENDERS.map((method) => (counts[method].trim() === "" ? 0 : parseDecimalToMinor(counts[method])));
  const valid = parsed.every((amount) => amount !== null) && counts.CASH.trim() !== "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const [cash, momo, card] = parsed as number[];
      const result = await tillApi.closeShift({
        clientId: shift.clientId,
        closedAt: new Date().toISOString(),
        countedCashMinor: cash!,
        countedMomoMinor: momo!,
        countedCardMinor: card!,
        notes: notes.trim() || null,
      });
      if (result.status === "rejected") setError(result.error);
      else onClosed({ shift: result.shift, summary: result.summary });
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {COUNT_FIELDS.map((field) => (
        <div key={field.method}>
          <label htmlFor={`count-${field.method}`} className="block text-sm font-semibold">
            {field.label}
          </label>
          <p id={`count-${field.method}-hint`} className="mb-1 text-xs text-ink-muted">
            {field.hint}
          </p>
          <Input
            id={`count-${field.method}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus={field.method === "CASH"}
            required={field.method === "CASH"}
            aria-describedby={`count-${field.method}-hint`}
            aria-invalid={counts[field.method] !== "" && parseDecimalToMinor(counts[field.method]) === null}
            value={counts[field.method]}
            onChange={(event) => setCounts({ ...counts, [field.method]: event.target.value.replace(/[^\d.,]/g, "") })}
            className="h-12 text-lg font-semibold tabular-nums"
          />
        </div>
      ))}
      <div>
        <label htmlFor="count-notes" className="mb-1 block text-sm font-semibold">
          Notes (optional)
        </label>
        <Textarea id="count-notes" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the manager should know" />
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={!valid || busy}>
        {busy ? "Closing the shift" : "Close the shift"}
      </Button>
    </form>
  );
}

function ShiftReport({ report, shop, paper, onDone }: { report: { shift: PosShiftView; summary: ShiftSummary }; shop: ShopDetails; paper: PaperWidth; onDone: () => void }) {
  const { shift, summary } = report;
  const counted = shift.countedMinor ?? { CASH: 0, MOMO: 0, CARD: 0 };
  const difference = countDifferences(summary.expectedMinor, counted);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {summary.salesCount} {summary.salesCount === 1 ? "sale" : "sales"} for <strong className="text-ink">{formatMoney(summary.salesTotalMinor)}</strong>. Opening float{" "}
        {formatMoney(shift.openingFloatMinor)}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-2 font-semibold">Method</th>
              <th className="py-2 text-right font-semibold">Expected</th>
              <th className="py-2 text-right font-semibold">Counted</th>
              <th className="py-2 text-right font-semibold">Difference</th>
            </tr>
          </thead>
          <tbody>
            {POS_TENDERS.map((method) => (
              <tr key={method} className="border-b border-line">
                <th scope="row" className="py-2 text-left font-semibold">
                  {POS_TENDER_LABELS[method]}
                </th>
                <td className="py-2 text-right tabular-nums">{formatMoney(summary.expectedMinor[method])}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(counted[method])}</td>
                <td className={cn("py-2 text-right font-semibold tabular-nums", difference[method] < 0 ? "text-danger" : difference[method] > 0 ? "text-warning" : "text-success")}>
                  {differenceLabel(difference[method])}
                  {difference[method] !== 0 ? ` ${formatMoney(Math.abs(difference[method]))}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="lg" onClick={() => window.print()}>
          <Printer /> Print report
        </Button>
        <Button size="lg" className="flex-1" onClick={onDone} autoFocus>
          Done
        </Button>
      </div>
      <PrintArea>
        <ShiftReportDocument shift={shift} summary={summary} shop={shop} paper={paper} />
      </PrintArea>
    </div>
  );
}

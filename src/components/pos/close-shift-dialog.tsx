"use client";

import { useState, type FormEvent } from "react";
import { CloudUpload, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { formatMoney, parseDecimalToMinor } from "@/lib/money";
import { countDifferences, POS_TENDER_LABELS, POS_TENDERS, type PosShiftView, type PosTenderCode } from "@/lib/pos";
import type { ShiftReport } from "@/lib/pos-outbox";
import { cn } from "@/lib/utils";
import { differenceLabel, PrintArea, ShiftReportDocument, type ShopDetails } from "./receipt";
import type { PaperWidth } from "./till-storage";

const COUNT_FIELDS: { method: PosTenderCode; label: string; hint: string }[] = [
  { method: "CASH", label: "Cash in the drawer", hint: "Count everything, including the opening float." },
  { method: "MOMO", label: "Mobile money received", hint: "The total on the mobile money statement for this shift." },
  { method: "CARD", label: "Card payments", hint: "The total on the card machine's end of day slip." },
];

/** What the cashier counted at the end of the shift. */
export interface ShiftCount {
  countedCashMinor: number;
  countedMomoMinor: number;
  countedCardMinor: number;
  notes: string | null;
}

/** A closed shift's report, and whether the shop's system has confirmed it yet. */
export type CloseOutcome = { report: ShiftReport; confirmed: boolean } | { error: string };

interface CloseShiftDialogProps {
  /** The shift being counted; the dialog is open while there is one. */
  shift: PosShiftView | null;
  shop: ShopDetails;
  paper: PaperWidth;
  onSubmit: (shift: PosShiftView, count: ShiftCount) => Promise<CloseOutcome>;
  /** Called when the cashier backs out or has finished with the report. */
  onDone: () => void;
}

/**
 * Closing a shift: the cashier counts first (without seeing what is
 * expected), then sees the report of expected against counted. With no
 * connection the report comes from the sales made on this till, and the close
 * is sent once the connection is back.
 */
export function CloseShiftDialog({ shift, shop, paper, onSubmit, onDone }: CloseShiftDialogProps) {
  const [result, setResult] = useState<{ report: ShiftReport; confirmed: boolean } | null>(null);

  function finish() {
    setResult(null);
    onDone();
  }

  return (
    <Dialog open={shift !== null} onOpenChange={(open) => !open && finish()}>
      {shift ? (
        <DialogContent
          title={result ? "Shift closed" : "Close the shift"}
          description={result ? undefined : `${shift.cashierName}'s shift on till ${shift.tillCode}`}
          className="max-w-lg"
        >
          {result ? (
            <ShiftReportView report={result.report} confirmed={result.confirmed} shop={shop} paper={paper} onDone={finish} />
          ) : (
            <CountForm shift={shift} onSubmit={onSubmit} onClosed={setResult} />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface CountFormProps {
  shift: PosShiftView;
  onSubmit: CloseShiftDialogProps["onSubmit"];
  onClosed: (result: { report: ShiftReport; confirmed: boolean }) => void;
}

function CountForm({ shift, onSubmit, onClosed }: CountFormProps) {
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
    const [cash, momo, card] = parsed as number[];
    const outcome = await onSubmit(shift, { countedCashMinor: cash!, countedMomoMinor: momo!, countedCardMinor: card!, notes: notes.trim() || null });
    setBusy(false);
    if ("error" in outcome) setError(outcome.error);
    else onClosed(outcome);
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

interface ShiftReportViewProps {
  report: ShiftReport;
  confirmed: boolean;
  shop: ShopDetails;
  paper: PaperWidth;
  onDone: () => void;
}

function ShiftReportView({ report, confirmed, shop, paper, onDone }: ShiftReportViewProps) {
  const { shift, summary } = report;
  const counted = shift.countedMinor ?? { CASH: 0, MOMO: 0, CARD: 0 };
  const difference = countDifferences(summary.expectedMinor, counted);
  return (
    <div className="space-y-4">
      {confirmed ? null : (
        <p role="status" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Worked out on this till from the sales made here. The close is sent to the shop&apos;s system, which checks it, once the connection is back.
        </p>
      )}
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
        <ShiftReportDocument shift={shift} summary={summary} shop={shop} paper={paper} provisional={!confirmed} />
      </PrintArea>
    </div>
  );
}

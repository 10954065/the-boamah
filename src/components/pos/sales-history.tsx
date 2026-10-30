"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, type PosShiftView, type TenderLine } from "@/lib/pos";
import type { SaleEntry } from "@/lib/pos-outbox";
import {
  receiptForRecord,
  receiptNumberFrom,
  returnProblem,
  saleReturnState,
  voidCheckOf,
  voidProblem,
  type PosRefundRecord,
  type PosSaleRecord,
} from "@/lib/pos-returns";
import type { ReceiptData, ReceiptLine } from "@/lib/pos-till";
import { formatQuantity } from "@/lib/quantity";
import { cn, formatDateTime } from "@/lib/utils";
import type { ShopDetails } from "./receipt";
import { ReturnItemsDialog } from "./return-dialog";
import { ReceiptDialog, RefundSlipDialog } from "./sale-status";
import type { TillCashier, TillInfo } from "./sell-screen";
import { failureOf, tillOnlineApi } from "./till-api";
import { formatTime, useOnline } from "./till-header";
import { addToJournal, markVoidedInJournal, type TillPrefs } from "./till-storage";
import { useOutbox } from "./till-sync";
import { VoidSaleDialog } from "./void-dialog";

interface SalesHistoryProps {
  till: TillInfo;
  cashier: TillCashier;
  shift: PosShiftView;
  shop: ShopDetails;
  prefs: TillPrefs;
  /** A void or a return put goods back on the shelf. */
  onStockChanged: () => void;
}

/** The shift's sales and refunds, from the side: reprint, void or take goods back. */
export function SalesHistorySheet({ open, onOpenChange, ...props }: SalesHistoryProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Sales this shift" closeLabel="Back to selling" className="w-full max-w-xl">
        <SalesHistory {...props} />
      </SheetContent>
    </Dialog>
  );
}

type Detail = { kind: "recorded"; sale: PosSaleRecord } | { kind: "waiting"; entry: SaleEntry };
type Row = { kind: "recorded"; sale: PosSaleRecord; soldAt: string } | { kind: "waiting"; entry: SaleEntry; soldAt: string };

function SalesHistory({ till, cashier, shift, shop, prefs, onStockChanged }: SalesHistoryProps) {
  const online = useOnline();
  const waiting = useOutbox(till.code).filter((entry): entry is SaleEntry => entry.kind === "sale" && entry.upload.shiftClientId === shift.clientId);
  const [history, setHistory] = useState<{ sales: PosSaleRecord[]; refunds: PosRefundRecord[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [voiding, setVoiding] = useState<PosSaleRecord | null>(null);
  const [returning, setReturning] = useState<PosSaleRecord | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [slip, setSlip] = useState<{ refund: PosRefundRecord; copy: boolean } | null>(null);

  // One id per sale for the return being made, kept until the shop's system answers.
  const [returnIds, setReturnIds] = useState<Record<string, string>>({});

  const load = useCallback(
    () =>
      tillOnlineApi.shiftHistory(shift.clientId).then(
        (data) => {
          // The shop's system is the record: a refund or void whose answer was lost still counts in this till's own report.
          for (const refund of data.refunds) addToJournal(till.code, shift.clientId, { kind: "refund", clientId: refund.clientId, method: refund.method, refundMinor: refund.refundMinor });
          for (const sale of data.sales) if (sale.status === "VOIDED") markVoidedInJournal(till.code, shift.clientId, sale.clientId);
          setHistory({ sales: data.sales, refunds: data.refunds });
          setDetail((current) => {
            const fresh = current?.kind === "recorded" ? data.sales.find((sale) => sale.id === current.sale.id) : undefined;
            return fresh ? { kind: "recorded", sale: fresh } : current;
          });
          setLoadError(null);
        },
        (error: unknown) => setLoadError(failureOf(error).message),
      ),
    [till.code, shift.clientId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function refresh() {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }

  async function find(event: FormEvent) {
    event.preventDefault();
    const number = receiptNumberFrom(search, till.code);
    if (!number) return setSearchError("Type a receipt number, for example 231 or T1-000231.");
    setSearchError(null);
    const local = waiting.find((entry) => entry.receipt.receiptNumber === number);
    if (local) return setDetail({ kind: "waiting", entry: local });
    setSearching(true);
    try {
      const { sale } = await tillOnlineApi.findReceipt(number);
      if (sale) setDetail({ kind: "recorded", sale });
      else setSearchError(`No sale has receipt ${number}.`);
    } catch (error) {
      setSearchError(failureOf(error).message);
    } finally {
      setSearching(false);
    }
  }

  function replaceSale(sale: PosSaleRecord) {
    setHistory((current) => current && { ...current, sales: current.sales.map((s) => (s.id === sale.id ? sale : s)) });
    setDetail({ kind: "recorded", sale });
  }

  function voided(sale: PosSaleRecord) {
    setVoiding(null);
    markVoidedInJournal(till.code, shift.clientId, sale.clientId);
    replaceSale(sale);
    onStockChanged();
    toast.success(`Receipt ${sale.receiptNumber} was voided.`);
  }

  function startReturn(sale: PosSaleRecord) {
    setReturnIds((ids) => (ids[sale.id] ? ids : { ...ids, [sale.id]: crypto.randomUUID() }));
    setReturning(sale);
  }

  /** Closed without an answer (for example the connection dropped): see what the shop's system recorded. */
  function closeReturn() {
    setReturning(null);
    if (navigator.onLine) refresh();
  }

  function returned(refund: PosRefundRecord, sale: PosSaleRecord) {
    setReturning(null);
    setReturnIds((ids) => Object.fromEntries(Object.entries(ids).filter(([saleId]) => saleId !== sale.id)));
    addToJournal(till.code, shift.clientId, { kind: "refund", clientId: refund.clientId, method: refund.method, refundMinor: refund.refundMinor });
    replaceSale(sale);
    setHistory((current) => current && { ...current, refunds: [refund, ...current.refunds.filter((r) => r.id !== refund.id)] });
    if (refund.lines.some((line) => line.restocked)) onStockChanged();
    setSlip({ refund, copy: false });
  }

  const recordedIds = new Set(history?.sales.map((sale) => sale.clientId));
  const rows: Row[] = [
    ...waiting.filter((entry) => !recordedIds.has(entry.upload.clientId)).map((entry): Row => ({ kind: "waiting", entry, soldAt: entry.upload.soldAt })),
    ...(history?.sales ?? []).map((sale): Row => ({ kind: "recorded", sale, soldAt: sale.soldAt })),
  ].toSorted((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));

  return (
    <div className="flex h-full flex-col">
      {detail ? (
        <SaleDetail
          detail={detail}
          shiftClientId={shift.clientId}
          online={online}
          onBack={() => setDetail(null)}
          onCopy={setReceipt}
          onVoid={setVoiding}
          onReturn={startReturn}
          onRefundSlip={(refund) => setSlip({ refund, copy: true })}
        />
      ) : (
        <div className="space-y-4 p-4">
          <form onSubmit={find} className="flex gap-2" role="search">
            <Input aria-label="Receipt number" placeholder="Find a receipt, for example 231" inputMode="text" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Button type="submit" variant="outline" disabled={searching}>
              <Search /> Find
            </Button>
          </form>
          {searchError ? <p className="text-sm text-danger">{searchError}</p> : null}

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {rows.length} {rows.length === 1 ? "sale" : "sales"} since {formatTime(shift.openedAt)}
            </h3>
            <Button size="sm" variant="ghost" disabled={!online || refreshing} onClick={refresh}>
              <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} /> Refresh
            </Button>
          </div>
          {loadError ? (
            <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              {online ? loadError : "No internet connection. Showing the sales still waiting on this till; the full list needs the internet."}
            </p>
          ) : null}
          {history === null && loadError === null ? <p className="text-sm text-ink-muted">Loading the shift&apos;s sales.</p> : null}

          {rows.length > 0 ? (
            <ul className="divide-y divide-line rounded-md border border-line">
              {rows.map((row) => (
                <SaleRow
                  key={row.kind === "recorded" ? row.sale.id : row.entry.id}
                  row={row}
                  onOpen={() => setDetail(row.kind === "recorded" ? { kind: "recorded", sale: row.sale } : { kind: "waiting", entry: row.entry })}
                />
              ))}
            </ul>
          ) : null}

          {history && history.refunds.length > 0 ? (
            <section aria-label="Refunds this shift" className="space-y-2">
              <h3 className="text-sm font-semibold">Refunds paid out this shift</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {history.refunds.map((refund) => (
                  <li key={refund.id}>
                    <button type="button" onClick={() => setSlip({ refund, copy: true })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-soft">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold tabular-nums">
                          {refund.number} · for {refund.receiptNumber}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {POS_TENDER_LABELS[refund.method]} at {formatTime(refund.createdAt)} · {refund.reason}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(refund.refundMinor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <ReceiptDialog receipt={receipt} copy waiting={false} shop={shop} prefs={prefs} onClose={() => setReceipt(null)} />
      <RefundSlipDialog refund={slip?.refund ?? null} copy={slip?.copy ?? true} shop={shop} prefs={prefs} onClose={() => setSlip(null)} />
      <VoidSaleDialog sale={voiding} shiftClientId={shift.clientId} canManage={cashier.canManage} onClose={() => setVoiding(null)} onVoided={voided} />
      <ReturnItemsDialog
        sale={returning}
        clientId={returning ? (returnIds[returning.id] ?? "") : ""}
        tillCode={till.code}
        shiftClientId={shift.clientId}
        canManage={cashier.canManage}
        onClose={closeReturn}
        onReturned={returned}
      />
    </div>
  );
}

function methodsText(payments: readonly TenderLine[]): string {
  return payments.map((payment) => POS_TENDER_LABELS[payment.method]).join(" + ");
}

function SaleRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const receipt = row.kind === "recorded" ? { number: row.sale.receiptNumber, total: row.sale.totalMinor, payments: row.sale.payments } : { number: row.entry.receipt.receiptNumber, total: row.entry.receipt.totalMinor, payments: row.entry.receipt.payments };
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-soft">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold tabular-nums">
            {receipt.number}
            <SaleBadge row={row} />
          </span>
          <span className="block text-xs text-ink-muted">
            {formatTime(row.soldAt)} · {methodsText(receipt.payments)}
          </span>
        </span>
        <span className={cn("shrink-0 text-sm font-bold tabular-nums", row.kind === "recorded" && row.sale.status === "VOIDED" && "text-ink-subtle line-through")}>
          {formatMoney(receipt.total)}
        </span>
      </button>
    </li>
  );
}

function SaleBadge({ row }: { row: Row }) {
  if (row.kind === "waiting") return row.entry.status === "refused" ? <Badge tone="danger">Not accepted</Badge> : <Badge tone="warning">Waiting to send</Badge>;
  if (row.sale.status === "VOIDED") return <Badge tone="danger">Voided</Badge>;
  const state = saleReturnState(row.sale);
  if (state === "part") return <Badge tone="gold">Part returned</Badge>;
  if (state === "all") return <Badge>Returned</Badge>;
  return null;
}

interface SaleDetailProps {
  detail: Detail;
  shiftClientId: string;
  online: boolean;
  onBack: () => void;
  onCopy: (receipt: ReceiptData) => void;
  onVoid: (sale: PosSaleRecord) => void;
  onReturn: (sale: PosSaleRecord) => void;
  onRefundSlip: (refund: PosRefundRecord) => void;
}

function SaleDetail({ detail, shiftClientId, online, onBack, onCopy, onVoid, onReturn, onRefundSlip }: SaleDetailProps) {
  const sale = detail.kind === "recorded" ? detail.sale : null;
  const receipt = sale ? receiptForRecord(sale) : detail.kind === "waiting" ? detail.entry.receipt : null;
  if (!receipt) return null;
  const canVoid = sale !== null && voidProblem(voidCheckOf(sale), shiftClientId) === null;
  const canReturn = sale !== null && returnProblem(sale) === null;

  return (
    <div className="space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft /> All sales
      </Button>
      <div>
        <p className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold tabular-nums">
          {receipt.receiptNumber}
          {sale?.status === "VOIDED" ? <Badge tone="danger">Voided</Badge> : null}
        </p>
        <p className="text-sm text-ink-muted">
          {formatDateTime(receipt.soldAt)} · {receipt.cashierName} · Till {receipt.tillCode}
        </p>
      </div>

      <ul className="divide-y divide-line rounded-md border border-line text-sm">
        {(sale?.lines ?? receipt.lines.map((line, index) => ({ ...lineOf(line), id: String(index) }))).map((line) => (
          <li key={line.id} className="flex gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{line.productName}</span>
              <span className="block text-xs text-ink-muted">
                {[line.variantName, formatQuantity(line.quantityMilli, line.unit)].filter(Boolean).join(" · ")}
                {line.returnedMilli > 0 ? ` · ${formatQuantity(line.returnedMilli, line.unit)} returned` : ""}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.lineTotalMinor)}</span>
          </li>
        ))}
        <li className="flex justify-between px-3 py-2 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(receipt.totalMinor)}</span>
        </li>
      </ul>
      <p className="text-sm text-ink-muted">
        Paid by {methodsText(receipt.payments)}
        {receipt.changeMinor > 0 ? `, change ${formatMoney(receipt.changeMinor)}` : ""}.
      </p>

      {sale?.voided ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          Voided at {formatTime(sale.voided.at)}
          {sale.voided.byName ? `, approved by ${sale.voided.byName}` : ""}
          {sale.voided.reason ? `: ${sale.voided.reason}` : ""}.
        </p>
      ) : null}
      {sale && sale.refunds.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {sale.refunds.map((refund) => (
            <li key={refund.id} className="flex items-center justify-between gap-2 rounded-md bg-soft px-3 py-2">
              <span>
                {refund.number}: {formatMoney(refund.refundMinor)} by {POS_TENDER_LABELS[refund.method].toLowerCase()} on {formatDateTime(refund.createdAt)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onRefundSlip(refund)}>
                Slip
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {detail.kind === "waiting" ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {detail.entry.status === "refused" ? `Not accepted: ${detail.entry.error}` : "Waiting on this till to be sent."} It can be voided or returned once the shop&apos;s system has it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onCopy(receipt)}>
          Print a copy
        </Button>
        {canReturn ? (
          <Button variant="outline" disabled={!online} onClick={() => sale && onReturn(sale)}>
            Return items
          </Button>
        ) : null}
        {canVoid ? (
          <Button variant="danger" disabled={!online} onClick={() => sale && onVoid(sale)}>
            Void sale
          </Button>
        ) : null}
      </div>
      {(canReturn || canVoid) && !online ? <p className="text-xs text-ink-muted">Voids and returns need the internet.</p> : null}
    </div>
  );
}

/** A line of a receipt still on the till, shaped like a recorded line. */
function lineOf(line: ReceiptLine) {
  return { productName: line.name, variantName: line.detail, unit: line.unit, quantityMilli: line.quantityMilli, lineTotalMinor: line.lineTotalMinor, returnedMilli: 0 };
}

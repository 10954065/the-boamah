"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/money";
import { countDifferences, POS_TENDER_LABELS, POS_TENDERS, type PosTenderCode, type ShiftSummary, type TenderTotals } from "@/lib/pos";
import type { PosRefundRecord } from "@/lib/pos-returns";
import { isWeighed, type ReceiptData, type ReceiptLine } from "@/lib/pos-till";
import { formatQuantity, milliToDecimalString } from "@/lib/quantity";
import { cn, formatDateTime } from "@/lib/utils";
import type { PosShiftView } from "@/lib/pos";
import type { PaperWidth } from "./till-storage";

/** The shop as printed on receipts and shift reports. */
export interface ShopDetails {
  name: string;
  address: string | null;
  phone: string | null;
}

// Printable width of thermal paper rolls.
const PAPER: Record<PaperWidth, { width: string; fontSize: string }> = {
  "80": { width: "72mm", fontSize: "12px" },
  "58": { width: "48mm", fontSize: "10.5px" },
};

function Row({ left, right, strong }: { left: ReactNode; right?: ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", strong && "font-bold")}>
      <span className="min-w-0">{left}</span>
      {right !== undefined ? <span className="shrink-0 tabular-nums">{right}</span> : null}
    </div>
  );
}

function Rule() {
  return <div className="my-[1.5mm] border-t border-dashed border-black" />;
}

function Paper({ paper, children }: { paper: PaperWidth; children: ReactNode }) {
  return (
    <div className="mx-auto bg-white leading-snug text-black" style={PAPER[paper]}>
      {children}
    </div>
  );
}

function ShopHeader({ shop }: { shop: ShopDetails }) {
  return (
    <div className="text-center">
      <p className="text-[1.25em] font-bold leading-tight">{shop.name}</p>
      {shop.address ? <p>{shop.address}</p> : null}
      {shop.phone ? <p>Tel {shop.phone}</p> : null}
    </div>
  );
}

function quantityText(line: Pick<ReceiptLine, "unit" | "quantityMilli">): string {
  return isWeighed(line.unit) ? formatQuantity(line.quantityMilli, line.unit) : milliToDecimalString(line.quantityMilli);
}

/** Printed at the foot of every receipt, as on the Vantage POS receipts. */
const SYSTEM_CREDIT = { name: "Sunleon Router Enterprise", phone: "0556105551", email: "admin@sunleonrouterenterprise.com" };

const RECEIPT_METHOD_LABELS: Record<PosTenderCode, string> = { CASH: "Cash", MOMO: "Mobile Money", CARD: "Card" };

/** The paper of a customer's slip in the Vantage POS layout: shop name and title on top, then the slip. */
function SlipFrame({ shop, paper, title, children }: { shop: ShopDetails; paper: PaperWidth; title: string; children: ReactNode }) {
  return (
    <div
      style={{ "--receipt-width": PAPER[paper].width } as CSSProperties}
      className="mx-auto w-full max-w-sm rounded-lg border border-line bg-white p-6 font-mono text-sm text-ink print:w-[var(--receipt-width)] print:max-w-none print:rounded-none print:border-0 print:p-2 print:text-xs print:text-black"
    >
      <div className="mb-4 text-center">
        <p className="text-base font-bold">{shop.name}</p>
        <p className="text-xs text-ink-muted print:text-black">{title}</p>
      </div>
      {children}
      <p className="mt-4 text-center text-xs text-ink-muted print:text-black">Thank you</p>
      <div className="mt-3 border-t border-dashed border-line-strong pt-2 text-center text-[10px] leading-tight text-ink-subtle print:border-black print:text-black">
        <p>System built by {SYSTEM_CREDIT.name}</p>
        <p>
          {SYSTEM_CREDIT.phone} &middot; {SYSTEM_CREDIT.email}
        </p>
      </div>
    </div>
  );
}

/**
 * The customer's receipt in the Vantage POS layout: shop name, the sale's
 * details, the items, the total, a thank you and the system credit.
 */
export function ReceiptDocument({ receipt, shop, paper, copy = false }: { receipt: ReceiptData; shop: ShopDetails; paper: PaperWidth; copy?: boolean }) {
  const [firstPayment] = receipt.payments;
  const split = receipt.payments.length > 1;
  const cash = receipt.payments.find((payment) => payment.method === "CASH");
  return (
    <SlipFrame shop={shop} paper={paper} title={copy ? "Receipt (copy)" : "Receipt"}>
      <div className="mb-3 space-y-0.5 text-xs text-ink-muted print:text-black">
        <p>Receipt #: {receipt.receiptNumber}</p>
        <p>Date: {formatDateTime(receipt.soldAt)}</p>
        <p>Cashier: {receipt.cashierName}</p>
        {firstPayment ? (
          <p>
            Payment: {split ? "Split payment" : RECEIPT_METHOD_LABELS[firstPayment.method]} · Paid
          </p>
        ) : null}
        {split ? (
          <div className="mt-1 space-y-0.5 pl-2">
            {receipt.payments.map((payment) => (
              <p key={payment.method}>
                &middot; {RECEIPT_METHOD_LABELS[payment.method]}: {formatMoney(payment.amountMinor)}
              </p>
            ))}
          </div>
        ) : null}
        {receipt.payments
          .filter((payment) => payment.reference)
          .map((payment) => (
            <p key={`ref-${payment.method}`}>
              {RECEIPT_METHOD_LABELS[payment.method]} ref: {payment.reference}
            </p>
          ))}
        {receipt.changeMinor > 0 && cash && !split ? <p>Cash received: {formatMoney(cash.amountMinor)}</p> : null}
        {receipt.changeMinor > 0 ? <p>Change: {formatMoney(receipt.changeMinor)}</p> : null}
      </div>
      <div className="mb-3 border-t border-dashed border-line-strong pt-2 print:border-black">
        {receipt.lines.map((line, index) => (
          <div key={`${index}-${line.name}`} className="mb-1 flex justify-between gap-2 break-inside-avoid">
            <span className="min-w-0 flex-1 break-words">
              {line.name}
              {line.detail ? ` (${line.detail})` : ""} x{quantityText(line)}
            </span>
            <span className="shrink-0">{formatMoney(line.lineTotalMinor)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-dashed border-line-strong pt-2 text-base font-bold print:border-black">
        <span>Total</span>
        <span>{formatMoney(receipt.totalMinor)}</span>
      </div>
    </SlipFrame>
  );
}

/** The refund slip for goods brought back, in the same layout as the receipt. */
export function RefundDocument({ refund, shop, paper, copy = false }: { refund: PosRefundRecord; shop: ShopDetails; paper: PaperWidth; copy?: boolean }) {
  return (
    <SlipFrame shop={shop} paper={paper} title={copy ? "Refund (copy)" : "Refund"}>
      <div className="mb-3 space-y-0.5 text-xs text-ink-muted print:text-black">
        <p>Refund #: {refund.number}</p>
        <p>For receipt #: {refund.receiptNumber}</p>
        <p>Date: {formatDateTime(refund.createdAt)}</p>
        <p>Cashier: {refund.cashierName}</p>
        <p>Approved by: {refund.approvedByName}</p>
        <p>Refunded: {RECEIPT_METHOD_LABELS[refund.method]}</p>
        {refund.reference ? (
          <p>
            {RECEIPT_METHOD_LABELS[refund.method]} ref: {refund.reference}
          </p>
        ) : null}
        <p>Reason: {refund.reason}</p>
      </div>
      <div className="mb-3 border-t border-dashed border-line-strong pt-2 print:border-black">
        {refund.lines.map((line) => (
          <div key={line.saleItemId} className="mb-1 flex justify-between gap-2 break-inside-avoid">
            <span className="min-w-0 flex-1 break-words">
              {line.productName}
              {line.variantName ? ` (${line.variantName})` : ""} x{quantityText(line)}
            </span>
            <span className="shrink-0">{formatMoney(line.refundMinor)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-dashed border-line-strong pt-2 text-base font-bold print:border-black">
        <span>Refund total</span>
        <span>{formatMoney(refund.refundMinor)}</span>
      </div>
    </SlipFrame>
  );
}

export function totalOf(totals: TenderTotals): number {
  return POS_TENDERS.reduce((sum, method) => sum + totals[method], 0);
}

export function differenceLabel(differenceMinor: number): string {
  if (differenceMinor === 0) return "Exact";
  return differenceMinor > 0 ? "Over by" : "Short by";
}

interface ShiftReportDocumentProps {
  shift: PosShiftView;
  summary: ShiftSummary;
  shop: ShopDetails;
  paper: PaperWidth;
  /** Worked out on the till while offline, before the shop's system confirmed it. */
  provisional?: boolean;
}

/** The end of shift report: what the sales took against what was counted. */
export function ShiftReportDocument({ shift, summary, shop, paper, provisional }: ShiftReportDocumentProps) {
  const counted = shift.countedMinor ?? { CASH: 0, MOMO: 0, CARD: 0 };
  const difference = countDifferences(summary.expectedMinor, counted);
  return (
    <Paper paper={paper}>
      <ShopHeader shop={shop} />
      <Rule />
      <p className="text-center text-[1.1em] font-bold">Shift report</p>
      {provisional ? <p className="text-center">Worked out on the till while offline</p> : null}
      <p>
        Till {shift.tillCode} · {shift.cashierName}
      </p>
      <p>Opened {formatDateTime(shift.openedAt)}</p>
      {shift.closedAt ? <p>Closed {formatDateTime(shift.closedAt)}</p> : null}
      <Rule />
      <Row left="Sales" right={summary.salesCount} />
      <Row strong left="Sales total" right={formatMoney(summary.salesTotalMinor)} />
      {summary.refundsCount > 0 ? <Row left={`Refunds (${summary.refundsCount})`} right={formatMoney(totalOf(summary.refundedMinor))} /> : null}
      {summary.voidsCount > 0 ? <Row left={`Voided sales (${summary.voidsCount})`} right={formatMoney(summary.voidedTotalMinor)} /> : null}
      <Row left="Opening float" right={formatMoney(shift.openingFloatMinor)} />
      <Rule />
      {POS_TENDERS.map((method) => (
        <div key={method} className="mb-[1.5mm] break-inside-avoid">
          <p className="font-semibold">{POS_TENDER_LABELS[method]}</p>
          {summary.refundedMinor[method] > 0 ? <Row left="Refunded" right={formatMoney(summary.refundedMinor[method])} /> : null}
          <Row left={method === "CASH" ? "Expected (with float)" : "Expected"} right={formatMoney(summary.expectedMinor[method])} />
          <Row left="Counted" right={formatMoney(counted[method])} />
          <Row strong left={differenceLabel(difference[method])} right={formatMoney(Math.abs(difference[method]))} />
        </div>
      ))}
      {shift.notes ? (
        <>
          <Rule />
          <p>Notes: {shift.notes}</p>
        </>
      ) : null}
    </Paper>
  );
}

const noSubscription = () => () => {};

/**
 * Puts a document straight under <body> for printing. While one is mounted,
 * printing shows only it (see .pos-print in globals.css), on paper without
 * the browser's margins, headers or footers.
 */
export function PrintArea({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="pos-print">
      <style>{"@page { margin: 0; }"}</style>
      {children}
    </div>,
    document.body,
  );
}

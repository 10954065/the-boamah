import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { formatRefundNumber, type PosRefundRecord, type PosSaleRecord } from "@/lib/pos-returns";
import type { SellingUnitCode } from "@/lib/quantity";
import { PosRejected, type TillUser } from "./common";

/** More sales than one shift sees in a day; the till lists the newest. */
const MAX_SHIFT_SALES = 300;

const refundSelect = {
  id: true,
  clientId: true,
  number: true,
  createdAt: true,
  reason: true,
  method: true,
  reference: true,
  refundMinor: true,
  sale: { select: { receiptNumber: true } },
  till: { select: { code: true } },
  cashier: { select: { name: true } },
  approvedBy: { select: { name: true } },
  items: {
    select: { saleItemId: true, quantityMilli: true, refundMinor: true, restocked: true, saleItem: { select: { productName: true, variantName: true, unit: true } } },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.PosReturnSelect;

type RefundRow = Prisma.PosReturnGetPayload<{ select: typeof refundSelect }>;

const saleRecordSelect = {
  id: true,
  clientId: true,
  receiptNumber: true,
  soldAt: true,
  status: true,
  totalMinor: true,
  paidMinor: true,
  changeMinor: true,
  voidedAt: true,
  voidReason: true,
  till: { select: { code: true } },
  cashier: { select: { name: true } },
  voidedBy: { select: { name: true } },
  shift: { select: { clientId: true, closedAt: true } },
  payments: { select: { method: true, amountMinor: true, reference: true }, orderBy: { id: "asc" } },
  creditCustomer: { select: { id: true, name: true, phone: true } },
  items: {
    select: { id: true, productName: true, variantName: true, unit: true, quantityMilli: true, unitPriceMinor: true, lineTotalMinor: true, returnedMilli: true, refundedMinor: true },
    orderBy: { id: "asc" },
  },
  returns: { select: refundSelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.PosSaleSelect;

type SaleRow = Prisma.PosSaleGetPayload<{ select: typeof saleRecordSelect }>;

export function toRefundRecord(row: RefundRow): PosRefundRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    number: formatRefundNumber(row.number),
    createdAt: row.createdAt.toISOString(),
    receiptNumber: row.sale.receiptNumber,
    tillCode: row.till.code,
    cashierName: row.cashier.name,
    approvedByName: row.approvedBy.name,
    reason: row.reason,
    method: row.method,
    reference: row.reference,
    refundMinor: row.refundMinor,
    lines: row.items.map((item) => ({
      saleItemId: item.saleItemId,
      productName: item.saleItem.productName,
      variantName: item.saleItem.variantName,
      unit: item.saleItem.unit as SellingUnitCode,
      quantityMilli: item.quantityMilli,
      refundMinor: item.refundMinor,
      restocked: item.restocked,
    })),
  };
}

function toSaleRecord(row: SaleRow): PosSaleRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    receiptNumber: row.receiptNumber,
    tillCode: row.till.code,
    cashierName: row.cashier.name,
    soldAt: row.soldAt.toISOString(),
    shiftClientId: row.shift?.clientId ?? null,
    shiftOpen: row.shift !== null && row.shift.closedAt === null,
    status: row.status,
    totalMinor: row.totalMinor,
    paidMinor: row.paidMinor,
    changeMinor: row.changeMinor,
    payments: row.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference })),
    creditCustomer: row.creditCustomer,
    lines: row.items.map((item) => ({ ...item, unit: item.unit as SellingUnitCode })),
    voided: row.voidedAt ? { at: row.voidedAt.toISOString(), byName: row.voidedBy?.name ?? null, reason: row.voidReason } : null,
    refunds: row.returns.map(toRefundRecord),
  };
}

export async function saleRecord(where: Prisma.PosSaleWhereUniqueInput): Promise<PosSaleRecord | null> {
  const row = await prisma.posSale.findUnique({ where, select: saleRecordSelect });
  return row ? toSaleRecord(row) : null;
}

export async function refundRecord(where: Prisma.PosReturnWhereUniqueInput): Promise<PosRefundRecord | null> {
  const row = await prisma.posReturn.findUnique({ where, select: refundSelect });
  return row ? toRefundRecord(row) : null;
}

/**
 * The sales recorded in a shift, newest first, and the refunds paid out of
 * it. A cashier sees their own shifts; a manager any.
 */
export async function shiftHistory(shiftClientId: string, user: TillUser): Promise<{ sales: PosSaleRecord[]; refunds: PosRefundRecord[] }> {
  const shift = await prisma.posShift.findUnique({ where: { clientId: shiftClientId }, select: { id: true, cashierId: true } });
  if (!shift) return { sales: [], refunds: [] };
  if (shift.cashierId !== user.id && !hasPermission(user.role, "pos:manage")) throw new PosRejected("This shift belongs to another cashier.");
  const [sales, refunds] = await Promise.all([
    prisma.posSale.findMany({ where: { shiftId: shift.id }, orderBy: { soldAt: "desc" }, take: MAX_SHIFT_SALES, select: saleRecordSelect }),
    prisma.posReturn.findMany({ where: { shiftId: shift.id }, orderBy: { createdAt: "desc" }, select: refundSelect }),
  ]);
  return { sales: sales.map(toSaleRecord), refunds: refunds.map(toRefundRecord) };
}

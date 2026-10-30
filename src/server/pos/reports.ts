import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { countDifferences, POS_TENDERS, summariseShiftSales, type PosTenderCode, type ShiftSummary, type TenderTotals } from "@/lib/pos";
import type { ReportPeriod } from "@/lib/pos-report";
import { formatRefundNumber } from "@/lib/pos-returns";
import type { SellingUnitCode } from "@/lib/quantity";
import { recordAudit } from "@/server/audit";

/**
 * What managers see of the till in the admin: takings for a period, the
 * sales and shifts behind them, and what needs a manager to look at it.
 */

const noTotals = (): TenderTotals => ({ CASH: 0, MOMO: 0, CARD: 0 });
const DAY_MS = 86_400_000;
/** Removals from tills listed for review. */
const REMOVALS_SHOWN_DAYS = 60;
/** Unbalanced shifts listed for review at once. */
const SHIFTS_SHOWN = 100;

// ---------------------------------------------------------------------------
// Takings for a period.
// ---------------------------------------------------------------------------

export interface TillReport {
  salesCount: number;
  salesTotalMinor: number;
  /** Money taken per method; cash net of change. */
  takenMinor: TenderTotals;
  refundsCount: number;
  refundedMinor: TenderTotals;
  voidsCount: number;
  voidedTotalMinor: number;
  /** Taken less refunded. */
  netMinor: TenderTotals;
  shortfallSales: number;
  priceDifferenceSales: number;
  byCashier: { id: string; name: string; salesCount: number; salesTotalMinor: number; refundedMinor: number; voidsCount: number }[];
  topProducts: { productName: string; variantName: string; unit: SellingUnitCode; quantityMilli: number; revenueMinor: number; returnedMilli: number }[];
  daily: { day: string; salesCount: number; salesTotalMinor: number; refundedMinor: number }[];
}

type CashierTotals = TillReport["byCashier"][number];

export async function tillReport(period: ReportPeriod): Promise<TillReport> {
  const range = { gte: period.start, lt: period.end };
  const [saleGroups, paymentGroups, refundGroups, shortfallSales, priceDifferenceSales, topRows, dailySales, dailyRefunds] = await Promise.all([
    prisma.posSale.groupBy({ by: ["status", "cashierId"], where: { soldAt: range }, _count: { _all: true }, _sum: { totalMinor: true, changeMinor: true } }),
    prisma.posPayment.groupBy({ by: ["method"], where: { sale: { status: "COMPLETED", soldAt: range } }, _sum: { amountMinor: true } }),
    prisma.posReturn.groupBy({ by: ["method", "cashierId"], where: { createdAt: range }, _count: { _all: true }, _sum: { refundMinor: true } }),
    prisma.posSale.count({ where: { soldAt: range, status: "COMPLETED", hasShortfall: true } }),
    prisma.posSale.count({ where: { soldAt: range, status: "COMPLETED", hasPriceDifference: true } }),
    prisma.$queryRaw<{ productName: string; variantName: string; unit: string; quantity: bigint; revenue: bigint; returned: bigint }[]>`
      SELECT i."productName", i."variantName", i.unit::text AS unit,
             sum(i."quantityMilli")::bigint AS quantity, sum(i."lineTotalMinor")::bigint AS revenue, sum(i."returnedMilli")::bigint AS returned
      FROM "PosSaleItem" i JOIN "PosSale" s ON s.id = i."saleId"
      WHERE s.status = 'COMPLETED' AND s."soldAt" >= ${period.start} AND s."soldAt" < ${period.end}
      GROUP BY i."variantId", i."productName", i."variantName", i.unit
      ORDER BY revenue DESC LIMIT 10`,
    prisma.$queryRaw<{ day: string; count: bigint; total: bigint }[]>`
      SELECT to_char("soldAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::bigint AS count, sum("totalMinor")::bigint AS total
      FROM "PosSale" WHERE status = 'COMPLETED' AND "soldAt" >= ${period.start} AND "soldAt" < ${period.end}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, sum("refundMinor")::bigint AS total
      FROM "PosReturn" WHERE "createdAt" >= ${period.start} AND "createdAt" < ${period.end}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const completed = saleGroups.filter((group) => group.status === "COMPLETED");
  const voided = saleGroups.filter((group) => group.status === "VOIDED");
  const sum = <T>(rows: readonly T[], value: (row: T) => number | null | undefined) => rows.reduce((total, row) => total + (value(row) ?? 0), 0);
  const changeMinor = sum(completed, (g) => g._sum.changeMinor);
  const paidBy = (method: PosTenderCode) => sum(paymentGroups.filter((g) => g.method === method), (g) => g._sum.amountMinor);
  const takenMinor: TenderTotals = { CASH: paidBy("CASH") - changeMinor, MOMO: paidBy("MOMO"), CARD: paidBy("CARD") };
  const refundedMinor = noTotals();
  for (const group of refundGroups) refundedMinor[group.method] += group._sum.refundMinor ?? 0;

  const cashierIds = [...new Set([...saleGroups.map((g) => g.cashierId), ...refundGroups.map((g) => g.cashierId)])];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: cashierIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byCashier = cashierIds
    .map(
      (id): CashierTotals => ({
        id,
        name: names.get(id) ?? "Unknown",
        salesCount: sum(completed.filter((g) => g.cashierId === id), (g) => g._count._all),
        salesTotalMinor: sum(completed.filter((g) => g.cashierId === id), (g) => g._sum.totalMinor),
        refundedMinor: sum(refundGroups.filter((g) => g.cashierId === id), (g) => g._sum.refundMinor),
        voidsCount: sum(voided.filter((g) => g.cashierId === id), (g) => g._count._all),
      }),
    )
    .toSorted((a, b) => b.salesTotalMinor - a.salesTotalMinor);

  const refundsByDay = new Map(dailyRefunds.map((row) => [row.day, Number(row.total)]));
  const days = [...new Set([...dailySales.map((row) => row.day), ...refundsByDay.keys()])].toSorted();
  return {
    salesCount: sum(completed, (g) => g._count._all),
    salesTotalMinor: sum(completed, (g) => g._sum.totalMinor),
    takenMinor,
    refundsCount: sum(refundGroups, (g) => g._count._all),
    refundedMinor,
    voidsCount: sum(voided, (g) => g._count._all),
    voidedTotalMinor: sum(voided, (g) => g._sum.totalMinor),
    netMinor: { CASH: takenMinor.CASH - refundedMinor.CASH, MOMO: takenMinor.MOMO - refundedMinor.MOMO, CARD: takenMinor.CARD - refundedMinor.CARD },
    shortfallSales,
    priceDifferenceSales,
    byCashier,
    topProducts: topRows.map((row) => ({
      productName: row.productName,
      variantName: row.variantName,
      unit: row.unit as SellingUnitCode,
      quantityMilli: Number(row.quantity),
      revenueMinor: Number(row.revenue),
      returnedMilli: Number(row.returned),
    })),
    daily: days.map((day) => {
      const sales = dailySales.find((row) => row.day === day);
      return { day, salesCount: Number(sales?.count ?? 0), salesTotalMinor: Number(sales?.total ?? 0), refundedMinor: refundsByDay.get(day) ?? 0 };
    }),
  };
}

/** Till sales and refunds since a moment, for the dashboard. */
export async function tillTakingsSince(since: Date): Promise<{ salesCount: number; salesTotalMinor: number; refundedMinor: number }> {
  const [sales, refunds] = await Promise.all([
    prisma.posSale.aggregate({ where: { status: "COMPLETED", soldAt: { gte: since } }, _count: { _all: true }, _sum: { totalMinor: true } }),
    prisma.posReturn.aggregate({ where: { createdAt: { gte: since } }, _sum: { refundMinor: true } }),
  ]);
  return { salesCount: sales._count._all, salesTotalMinor: sales._sum.totalMinor ?? 0, refundedMinor: refunds._sum.refundMinor ?? 0 };
}

// ---------------------------------------------------------------------------
// Sales.
// ---------------------------------------------------------------------------

export const SALE_FILTERS = { all: "All sales", flagged: "Short of stock or price changed", voided: "Voided", returned: "With returns" } as const;
export type SaleFilter = keyof typeof SALE_FILTERS;

const SALE_FILTER_WHERE: Record<SaleFilter, Prisma.PosSaleWhereInput> = {
  all: {},
  flagged: { OR: [{ hasShortfall: true }, { hasPriceDifference: true }] },
  voided: { status: "VOIDED" },
  returned: { returns: { some: {} } },
};

/** A flagged or voided sale nobody has looked at yet. */
const SALE_NEEDS_REVIEW: Prisma.PosSaleWhereInput = { reviewedAt: null, OR: [{ hasShortfall: true }, { hasPriceDifference: true }, { status: "VOIDED" }] };

const saleRowSelect = {
  id: true,
  receiptNumber: true,
  soldAt: true,
  status: true,
  totalMinor: true,
  hasShortfall: true,
  hasPriceDifference: true,
  reviewedAt: true,
  till: { select: { code: true } },
  cashier: { select: { name: true } },
  payments: { select: { method: true } },
  returns: { select: { refundMinor: true } },
} satisfies Prisma.PosSaleSelect;

export type TillSaleRow = Prisma.PosSaleGetPayload<{ select: typeof saleRowSelect }>;

export async function tillSales(period: ReportPeriod, filter: SaleFilter, page: number, pageSize: number): Promise<{ rows: TillSaleRow[]; total: number }> {
  const where: Prisma.PosSaleWhereInput = { soldAt: { gte: period.start, lt: period.end }, ...SALE_FILTER_WHERE[filter] };
  const [rows, total] = await Promise.all([
    prisma.posSale.findMany({ where, orderBy: { soldAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: saleRowSelect }),
    prisma.posSale.count({ where }),
  ]);
  return { rows, total };
}

export function tillSaleDetail(id: string) {
  return prisma.posSale.findUnique({
    where: { id },
    include: {
      till: { select: { code: true, name: true } },
      cashier: { select: { name: true, email: true } },
      voidedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      shift: { select: { id: true, openedAt: true, closedAt: true } },
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { id: "asc" } },
      returns: {
        orderBy: { createdAt: "asc" },
        include: {
          cashier: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: { include: { saleItem: { select: { productName: true, variantName: true, unit: true } } } },
          movements: { include: { variant: { select: { name: true, product: { select: { name: true } } } } } },
        },
      },
      movements: { orderBy: { createdAt: "asc" }, include: { variant: { select: { name: true, product: { select: { name: true } } } } } },
    },
  });
}

export type TillSaleDetail = NonNullable<Awaited<ReturnType<typeof tillSaleDetail>>>;

// ---------------------------------------------------------------------------
// Shifts.
// ---------------------------------------------------------------------------

const shiftRowSelect = {
  id: true,
  openedAt: true,
  closedAt: true,
  openingFloatMinor: true,
  countedCashMinor: true,
  countedMomoMinor: true,
  countedCardMinor: true,
  notes: true,
  reviewedAt: true,
  reviewNote: true,
  till: { select: { code: true } },
  cashier: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.PosShiftSelect;

type ShiftRow = Prisma.PosShiftGetPayload<{ select: typeof shiftRowSelect }>;

export interface TillShift extends ShiftRow {
  summary: ShiftSummary;
  counted: TenderTotals | null;
  /** Counted less expected, once closed. */
  difference: TenderTotals | null;
}

/** Shifts with what their sales and refunds came to, worked out from the records each time. */
async function withSummaries(shifts: readonly ShiftRow[]): Promise<TillShift[]> {
  const ids = shifts.map((shift) => shift.id);
  const [sales, refunds] = await Promise.all([
    prisma.posSale.findMany({ where: { shiftId: { in: ids } }, select: { shiftId: true, status: true, totalMinor: true, changeMinor: true, payments: { select: { method: true, amountMinor: true } } } }),
    prisma.posReturn.findMany({ where: { shiftId: { in: ids } }, select: { shiftId: true, method: true, refundMinor: true } }),
  ]);
  return shifts.map((shift) => {
    const summary = summariseShiftSales(
      shift.openingFloatMinor,
      sales.filter((sale) => sale.shiftId === shift.id),
      refunds.filter((refund) => refund.shiftId === shift.id),
    );
    const counted = shift.closedAt ? { CASH: shift.countedCashMinor ?? 0, MOMO: shift.countedMomoMinor ?? 0, CARD: shift.countedCardMinor ?? 0 } : null;
    return { ...shift, summary, counted, difference: counted ? countDifferences(summary.expectedMinor, counted) : null };
  });
}

export function hasDifference(shift: Pick<TillShift, "difference">): boolean {
  return shift.difference !== null && POS_TENDERS.some((method) => shift.difference![method] !== 0);
}

export const SHIFT_FILTERS = { all: "All shifts", open: "Open now", closed: "Closed" } as const;
export type ShiftFilter = keyof typeof SHIFT_FILTERS;

export async function tillShifts(filter: ShiftFilter, page: number, pageSize: number): Promise<{ rows: TillShift[]; total: number }> {
  const where: Prisma.PosShiftWhereInput = filter === "open" ? { closedAt: null } : filter === "closed" ? { closedAt: { not: null } } : {};
  const [shifts, total] = await Promise.all([
    prisma.posShift.findMany({ where, orderBy: { openedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: shiftRowSelect }),
    prisma.posShift.count({ where }),
  ]);
  return { rows: await withSummaries(shifts), total };
}

export async function tillShiftDetail(id: string) {
  const shift = await prisma.posShift.findUnique({ where: { id }, select: shiftRowSelect });
  if (!shift) return null;
  const [[withSummary], sales, refunds] = await Promise.all([
    withSummaries([shift]),
    prisma.posSale.findMany({ where: { shiftId: id }, orderBy: { soldAt: "asc" }, select: saleRowSelect }),
    prisma.posReturn.findMany({
      where: { shiftId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, number: true, createdAt: true, method: true, refundMinor: true, reason: true, sale: { select: { id: true, receiptNumber: true } }, approvedBy: { select: { name: true } } },
    }),
  ]);
  return { shift: withSummary!, sales, refunds: refunds.map((refund) => ({ ...refund, numberLabel: formatRefundNumber(refund.number) })) };
}

// ---------------------------------------------------------------------------
// What needs a manager to look at it.
// ---------------------------------------------------------------------------

export interface RemovalRecord {
  id: string;
  createdAt: Date;
  approvedBy: string | null;
  tillCode: string | null;
  kind: string | null;
  receiptNumber: string | null;
  totalMinor: number | null;
  cashierName: string | null;
  reason: string | null;
  error: string | null;
}

function text(details: Record<string, unknown>, key: string): string | null {
  return typeof details[key] === "string" ? details[key] : null;
}

function removalOf(row: { id: string; createdAt: Date; details: Prisma.JsonValue; actor: { name: string } | null }): RemovalRecord {
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : {};
  return {
    id: row.id,
    createdAt: row.createdAt,
    approvedBy: row.actor?.name ?? null,
    tillCode: text(details, "tillCode"),
    kind: text(details, "kind"),
    receiptNumber: text(details, "receiptNumber"),
    totalMinor: typeof details.totalMinor === "number" ? details.totalMinor : null,
    cashierName: text(details, "cashierName"),
    reason: text(details, "reason"),
    error: text(details, "error"),
  };
}

/**
 * Closed shifts nobody has looked at whose count differs from what was
 * expected, newest first. Balanced shifts are never marked as looked at, so
 * they are told apart here in the database rather than by reading them all.
 * Same sums as summariseShift; the caller checks each one again with it.
 */
async function unbalancedShiftIds(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH pending AS (
      SELECT id FROM "PosShift" WHERE "closedAt" IS NOT NULL AND "reviewedAt" IS NULL
    ), taken AS (
      SELECT s."shiftId",
             sum(p."amountMinor") FILTER (WHERE p.method = 'CASH') AS cash,
             sum(p."amountMinor") FILTER (WHERE p.method = 'MOMO') AS momo,
             sum(p."amountMinor") FILTER (WHERE p.method = 'CARD') AS card
      FROM "PosPayment" p JOIN "PosSale" s ON s.id = p."saleId"
      WHERE s.status = 'COMPLETED' AND s."shiftId" IN (SELECT id FROM pending)
      GROUP BY s."shiftId"
    ), change AS (
      SELECT "shiftId", sum("changeMinor") AS change FROM "PosSale"
      WHERE status = 'COMPLETED' AND "shiftId" IN (SELECT id FROM pending)
      GROUP BY "shiftId"
    ), refunded AS (
      SELECT "shiftId",
             sum("refundMinor") FILTER (WHERE method = 'CASH') AS cash,
             sum("refundMinor") FILTER (WHERE method = 'MOMO') AS momo,
             sum("refundMinor") FILTER (WHERE method = 'CARD') AS card
      FROM "PosReturn" WHERE "shiftId" IN (SELECT id FROM pending)
      GROUP BY "shiftId"
    )
    SELECT sh.id FROM "PosShift" sh
    JOIN pending ON pending.id = sh.id
    LEFT JOIN taken t ON t."shiftId" = sh.id
    LEFT JOIN change c ON c."shiftId" = sh.id
    LEFT JOIN refunded r ON r."shiftId" = sh.id
    WHERE coalesce(sh."countedCashMinor", 0) <> sh."openingFloatMinor" + coalesce(t.cash, 0) - coalesce(c.change, 0) - coalesce(r.cash, 0)
       OR coalesce(sh."countedMomoMinor", 0) <> coalesce(t.momo, 0) - coalesce(r.momo, 0)
       OR coalesce(sh."countedCardMinor", 0) <> coalesce(t.card, 0) - coalesce(r.card, 0)
    ORDER BY sh."closedAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}

export async function tillReviewQueue(now: Date = new Date()) {
  const unbalanced = await unbalancedShiftIds(SHIFTS_SHOWN);
  const [sales, refunds, closedShifts, removals] = await Promise.all([
    prisma.posSale.findMany({
      where: SALE_NEEDS_REVIEW,
      orderBy: { soldAt: "desc" },
      take: 100,
      select: { ...saleRowSelect, voidReason: true, voidedBy: { select: { name: true } } },
    }),
    prisma.posReturn.findMany({
      where: { reviewedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, number: true, createdAt: true, refundMinor: true, method: true, reason: true, sale: { select: { id: true, receiptNumber: true } }, cashier: { select: { name: true } }, approvedBy: { select: { name: true } } },
    }),
    prisma.posShift.findMany({ where: { id: { in: unbalanced } }, orderBy: { closedAt: "desc" }, select: shiftRowSelect }),
    prisma.auditLog.findMany({
      where: { action: "pos.entry.removed", createdAt: { gte: new Date(now.getTime() - REMOVALS_SHOWN_DAYS * DAY_MS) } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, details: true, actor: { select: { name: true } } },
    }),
  ]);
  const shifts = (await withSummaries(closedShifts)).filter(hasDifference);
  return {
    sales,
    refunds: refunds.map((refund) => ({ ...refund, numberLabel: formatRefundNumber(refund.number) })),
    shifts,
    removals: removals.map(removalOf),
    count: sales.length + refunds.length + shifts.length,
  };
}

export const REVIEW_KINDS = ["sale", "return", "shift"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Marks something as looked at by a manager, with an optional note. False when it was already marked (or a shift is still open). */
export async function markTillReviewed(kind: ReviewKind, id: string, note: string | null, reviewerId: string): Promise<boolean> {
  const data = { reviewedAt: new Date(), reviewedById: reviewerId, reviewNote: note };
  return prisma.$transaction(async (tx) => {
    const { count } =
      kind === "sale"
        ? await tx.posSale.updateMany({ where: { id, reviewedAt: null }, data })
        : kind === "return"
          ? await tx.posReturn.updateMany({ where: { id, reviewedAt: null }, data })
          : await tx.posShift.updateMany({ where: { id, reviewedAt: null, closedAt: { not: null } }, data });
    if (count === 0) return false;
    await recordAudit({ actorId: reviewerId, action: "pos.review", entityType: kind === "sale" ? "PosSale" : kind === "return" ? "PosReturn" : "PosShift", entityId: id, details: { note } }, tx);
    return true;
  });
}

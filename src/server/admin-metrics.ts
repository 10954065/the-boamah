import "server-only";
import type { FulfilmentMethod, OrderStatus, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { countCustomers } from "@/server/customers";

const DAY_MS = 86_400_000;

/** Website orders still being worked on, by where they are. */
export const PIPELINE_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "READY", "OUT_FOR_DELIVERY"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export interface DashboardMetrics {
  totalOrders: number;
  completedOrders: number;
  paidRevenueMinor: number;
  paidOrders: number;
  /** The same figures for the same length of time just before. */
  previous: { totalOrders: number; paidRevenueMinor: number; paidOrders: number };
  /** All open website orders by status, whenever they were placed. */
  pipeline: Record<PipelineStatus, number>;
  /** Paid revenue in the period: paid online, or cash on delivery collected. */
  paidByMethod: { onlineMinor: number; cashOnDeliveryMinor: number };
  pendingOnline: { count: number; amountMinor: number };
  codOutstanding: { count: number; amountMinor: number };
  customers: number;
  lowStock: { id: string; productName: string; variantName: string; stockMilli: number; lowStockMilli: number; unit: string; productId: string }[];
  recentOrders: {
    id: string;
    reference: string;
    customerName: string;
    totalMinor: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    fulfilmentMethod: FulfilmentMethod;
    createdAt: Date;
  }[];
  bestSellers: { productId: string; name: string; quantityMilli: number; revenueMinor: number }[];
  daily: { day: string; paidMinor: number; orders: number }[];
}

/**
 * Metrics for the period [since, now]. "Revenue" counts only verified paid
 * orders; pending online payments and unpaid cash-on-delivery orders are
 * reported separately and never mixed into revenue.
 */
export async function getDashboardMetrics(days: number, now = new Date()): Promise<DashboardMetrics> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const inRange = { createdAt: { gte: since } };
  const before = { createdAt: { gte: new Date(since.getTime() - days * DAY_MS), lt: since } };

  const [totalOrders, completedOrders, paid, previousOrders, previousPaid, pipelineRows, paidByMethodRows, pendingOnline, codOutstanding, customers, lowStockRows, recentOrders, bestSellerRows, dailyRows] =
    await Promise.all([
      prisma.order.count({ where: inRange }),
      prisma.order.count({ where: { ...inRange, status: "DELIVERED" } }),
      prisma.order.aggregate({ where: { ...inRange, paymentStatus: "PAID" }, _sum: { totalMinor: true }, _count: true }),
      prisma.order.count({ where: before }),
      prisma.order.aggregate({ where: { ...before, paymentStatus: "PAID" }, _sum: { totalMinor: true }, _count: true }),
      prisma.order.groupBy({ by: ["status"], where: { status: { in: [...PIPELINE_STATUSES] } }, _count: true }),
      prisma.order.groupBy({ by: ["paymentMethod"], where: { ...inRange, paymentStatus: "PAID" }, _sum: { totalMinor: true } }),
      prisma.order.aggregate({ where: { status: "PENDING_PAYMENT" }, _sum: { totalMinor: true }, _count: true }),
      prisma.order.aggregate({
        where: { paymentMethod: "CASH_ON_DELIVERY", paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
        _sum: { totalMinor: true },
        _count: true,
      }),
      countCustomers(),
      prisma.$queryRaw<DashboardMetrics["lowStock"]>`
        SELECT v.id, p.name AS "productName", v.name AS "variantName", v."stockMilli", v."lowStockMilli", v.unit::text AS unit, p.id AS "productId"
        FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
        WHERE v."isActive" AND p.status <> 'ARCHIVED' AND v."stockMilli" <= v."lowStockMilli"
        ORDER BY v."stockMilli" ASC LIMIT 10`,
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, reference: true, customerName: true, totalMinor: true, status: true, paymentStatus: true, paymentMethod: true, fulfilmentMethod: true, createdAt: true },
      }),
      prisma.$queryRaw<{ productId: string; name: string; quantityMilli: bigint; revenueMinor: bigint }[]>`
        SELECT oi."productId", max(oi."productName") AS name, sum(oi."quantityMilli") AS "quantityMilli", sum(oi."lineTotalMinor") AS "revenueMinor"
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."createdAt" >= ${since} AND o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT') AND oi."productId" IS NOT NULL
        GROUP BY oi."productId" ORDER BY sum(oi."lineTotalMinor") DESC LIMIT 5`,
      prisma.$queryRaw<{ day: Date; paidMinor: bigint; orders: bigint }[]>`
        SELECT date_trunc('day', o."createdAt" AT TIME ZONE 'UTC') AS day,
               coalesce(sum(o."totalMinor") FILTER (WHERE o."paymentStatus" = 'PAID'), 0) AS "paidMinor",
               count(*) AS orders
        FROM "Order" o WHERE o."createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
    ]);

  const byDay = new Map(dailyRows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const daily: DashboardMetrics["daily"] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    const row = byDay.get(day);
    daily.push({ day, paidMinor: Number(row?.paidMinor ?? 0), orders: Number(row?.orders ?? 0) });
  }

  const pipeline = Object.fromEntries(PIPELINE_STATUSES.map((status) => [status, 0])) as Record<PipelineStatus, number>;
  for (const row of pipelineRows) pipeline[row.status as PipelineStatus] = row._count;
  const paidWith = (method: PaymentMethod) => paidByMethodRows.find((row) => row.paymentMethod === method)?._sum.totalMinor ?? 0;
  const paidRevenueMinor = paid._sum.totalMinor ?? 0;

  return {
    totalOrders,
    completedOrders,
    paidRevenueMinor,
    paidOrders: paid._count,
    previous: { totalOrders: previousOrders, paidRevenueMinor: previousPaid._sum.totalMinor ?? 0, paidOrders: previousPaid._count },
    pipeline,
    paidByMethod: { cashOnDeliveryMinor: paidWith("CASH_ON_DELIVERY"), onlineMinor: paidRevenueMinor - paidWith("CASH_ON_DELIVERY") },
    pendingOnline: { count: pendingOnline._count, amountMinor: pendingOnline._sum.totalMinor ?? 0 },
    codOutstanding: { count: codOutstanding._count, amountMinor: codOutstanding._sum.totalMinor ?? 0 },
    customers,
    lowStock: lowStockRows,
    recentOrders,
    bestSellers: bestSellerRows.map((r) => ({ productId: r.productId, name: r.name, quantityMilli: Number(r.quantityMilli), revenueMinor: Number(r.revenueMinor) })),
    daily,
  };
}

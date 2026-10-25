import "server-only";
import type { FulfilmentMethod, OrderStatus, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export interface DashboardMetrics {
  totalOrders: number;
  awaitingProcessing: number;
  completedOrders: number;
  paidRevenueMinor: number;
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
export async function getDashboardMetrics(days: number): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - days * 86_400_000);
  const inRange = { createdAt: { gte: since } };

  const [totalOrders, awaitingProcessing, completedOrders, paid, pendingOnline, codOutstanding, customers, lowStockRows, recentOrders, bestSellerRows, dailyRows] =
    await Promise.all([
      prisma.order.count({ where: inRange }),
      prisma.order.count({ where: { status: { in: ["CONFIRMED", "PROCESSING", "READY"] } } }),
      prisma.order.count({ where: { ...inRange, status: "DELIVERED" } }),
      prisma.order.aggregate({ where: { ...inRange, paymentStatus: "PAID" }, _sum: { totalMinor: true } }),
      prisma.order.aggregate({ where: { status: "PENDING_PAYMENT" }, _sum: { totalMinor: true }, _count: true }),
      prisma.order.aggregate({
        where: { paymentMethod: "CASH_ON_DELIVERY", paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
        _sum: { totalMinor: true },
        _count: true,
      }),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
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
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    daily.push({ day, paidMinor: Number(row?.paidMinor ?? 0), orders: Number(row?.orders ?? 0) });
  }

  return {
    totalOrders,
    awaitingProcessing,
    completedOrders,
    paidRevenueMinor: paid._sum.totalMinor ?? 0,
    pendingOnline: { count: pendingOnline._count, amountMinor: pendingOnline._sum.totalMinor ?? 0 },
    codOutstanding: { count: codOutstanding._count, amountMinor: codOutstanding._sum.totalMinor ?? 0 },
    customers,
    lowStock: lowStockRows,
    recentOrders,
    bestSellers: bestSellerRows.map((r) => ({ productId: r.productId, name: r.name, quantityMilli: Number(r.quantityMilli), revenueMinor: Number(r.revenueMinor) })),
    daily,
  };
}

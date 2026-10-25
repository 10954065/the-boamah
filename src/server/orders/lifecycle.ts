import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { canTransition, type OrderStatusCode } from "@/lib/order-status";
import { recordAudit } from "@/server/audit";
import { releaseOrderStock } from "@/server/inventory";
import { verifyAndApply } from "@/server/payments/service";
import { generatePaymentReference } from "./reference";

export class OrderActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderActionError";
  }
}

/**
 * Inventory policy: stock is reserved when an order is placed and released
 * exactly once if the order is cancelled. Delivery does not change stock.
 */
async function cancelInTx(tx: Tx, input: { orderId: string; actorId: string | null; reason: string; failPayment: boolean }): Promise<boolean> {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderActionError("Order not found.");
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: { notIn: ["CANCELLED", "DELIVERED"] }, paymentStatus: { not: "PAID" } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: input.reason,
      paymentDueAt: null,
      ...(input.failPayment && order.paymentStatus === "PENDING" ? { paymentStatus: "FAILED" } : {}),
    },
  });
  if (updated.count === 0) return false;

  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: order.status, toStatus: "CANCELLED", note: input.reason, actorId: input.actorId },
  });
  await releaseOrderStock(tx, order.id, input.actorId, `Order cancelled: ${input.reason}`);

  const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });
  if (redemption) {
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${redemption.couponId}`;
  }
  return true;
}

export async function cancelOrder(input: { orderId: string; actorId: string | null; reason: string }): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderActionError("Order not found.");
  const check = canTransition(order.status, "CANCELLED", order);
  if (!check.ok) throw new OrderActionError(check.message);
  const cancelled = await prisma.$transaction((tx) => cancelInTx(tx, { ...input, failPayment: true }));
  if (!cancelled) throw new OrderActionError("This order can no longer be cancelled.");
  if (input.actorId) {
    await recordAudit({ actorId: input.actorId, action: "order.cancel", entityType: "Order", entityId: order.id, details: { reason: input.reason } });
  }
  const { notifyOrderCancelled } = await import("@/server/notifications/order-emails");
  await notifyOrderCancelled(order.id);
}

export async function updateOrderStatus(input: { orderId: string; to: OrderStatusCode; actorId: string; note?: string }): Promise<void> {
  if (input.to === "CANCELLED") {
    await cancelOrder({ orderId: input.orderId, actorId: input.actorId, reason: input.note || "Cancelled by staff" });
    return;
  }
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderActionError("Order not found.");
  const check = canTransition(order.status, input.to, order);
  if (!check.ok) throw new OrderActionError(check.message);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: input.to, ...(input.to === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
    });
    if (updated.count === 0) throw new OrderActionError("The order was changed by someone else. Refresh and try again.");
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: input.to, note: input.note || null, actorId: input.actorId },
    });
    await recordAudit({ actorId: input.actorId, action: "order.status", entityType: "Order", entityId: order.id, details: { from: order.status, to: input.to } }, tx);
  });

  const { notifyStatusChange } = await import("@/server/notifications/order-emails");
  await notifyStatusChange(order.id);
}

/** Records cash collected for a cash-on-delivery order. Amount must equal the order total. */
export async function recordCashPayment(input: { orderId: string; actorId: string; amountMinor: number }): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderActionError("Order not found.");
  if (order.paymentMethod !== "CASH_ON_DELIVERY") throw new OrderActionError("This order was not placed as cash on delivery.");
  if (order.paymentStatus === "PAID") throw new OrderActionError("Payment has already been recorded for this order.");
  if (order.status === "CANCELLED") throw new OrderActionError("Cannot record payment on a cancelled order.");
  if (input.amountMinor !== order.totalMinor) throw new OrderActionError("The amount collected must equal the order total.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: "UNPAID" },
      data: { paymentStatus: "PAID", paidAt: new Date() },
    });
    if (updated.count === 0) throw new OrderActionError("Payment has already been recorded for this order.");
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "CASH",
        reference: generatePaymentReference(order.reference),
        amountMinor: input.amountMinor,
        currency: order.currency,
        status: "SUCCESS",
        paidAt: new Date(),
        recordedById: input.actorId,
        channel: "cash",
      },
    });
    await recordAudit({ actorId: input.actorId, action: "order.cash_collected", entityType: "Order", entityId: order.id, details: { amountMinor: input.amountMinor } }, tx);
  });
}

/**
 * Cancels online orders whose payment window has passed and releases their
 * stock. Before cancelling, each pending attempt is re-verified with the
 * provider so a late-but-successful payment is honoured instead.
 */
export async function expireUnpaidOrders(now = new Date(), limit = 50): Promise<{ expired: number; paid: number; deferred: number }> {
  const overdue = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentDueAt: { lt: now } },
    include: { payments: { where: { status: "INITIALIZED" }, orderBy: { createdAt: "desc" } } },
    take: limit,
  });
  let expired = 0;
  let paid = 0;
  let deferred = 0;
  for (const order of overdue) {
    let decision: "expire" | "paid" | "defer" = "expire";
    for (const payment of order.payments) {
      try {
        const result = await verifyAndApply(payment.reference);
        if (result.outcome === "PAID" || result.outcome === "ALREADY_PAID") {
          decision = "paid";
          break;
        }
      } catch (error) {
        // Could not reach the provider: never cancel blind — retry on the next run.
        console.error("[orders] verification during expiry failed", { reference: payment.reference, error });
        decision = "defer";
      }
    }
    if (decision === "paid") {
      paid += 1;
      continue;
    }
    if (decision === "defer") {
      deferred += 1;
      continue;
    }
    const cancelled = await prisma.$transaction((tx) =>
      cancelInTx(tx, { orderId: order.id, actorId: null, reason: "Payment was not completed in time.", failPayment: true }),
    );
    if (cancelled) {
      expired += 1;
      const { notifyOrderCancelled } = await import("@/server/notifications/order-emails");
      await notifyOrderCancelled(order.id);
    }
  }
  return { expired, paid, deferred };
}

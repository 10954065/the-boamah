import "server-only";
import { prisma } from "@/lib/db";
import type { OrderStatusCode } from "@/lib/order-status";
import { packAction, TILL_ORDER_STATUSES, type TillOrder, type TillOrderStatus } from "@/lib/pos-orders";
import type { SellingUnitCode } from "@/lib/quantity";
import { OrderActionError, updateOrderStatus } from "@/server/orders/lifecycle";

/** Far more than a shop has waiting at once; the oldest come first, so nothing waiting is hidden by newer orders. */
const MAX_ORDERS = 200;

/** Website orders to pack or hand over, longest waiting first. Only what packing and handing over need. */
export async function tillOrders(): Promise<TillOrder[]> {
  const orders = await prisma.order.findMany({
    where: { status: { in: [...TILL_ORDER_STATUSES] } },
    orderBy: { createdAt: "asc" },
    take: MAX_ORDERS,
    select: {
      id: true,
      reference: true,
      createdAt: true,
      status: true,
      customerName: true,
      phone: true,
      fulfilmentMethod: true,
      zoneName: true,
      city: true,
      area: true,
      addressLine: true,
      addressDetails: true,
      deliveryInstructions: true,
      paymentMethod: true,
      paymentStatus: true,
      totalMinor: true,
      items: { select: { id: true, productName: true, variantName: true, sku: true, unit: true, imageUrl: true, quantityMilli: true } },
    },
  });

  return orders.map(({ createdAt, status, items, ...order }) => ({
    ...order,
    placedAt: createdAt.toISOString(),
    status: status as TillOrderStatus,
    lines: items.map((item) => ({ ...item, unit: item.unit as SellingUnitCode })),
  }));
}

/**
 * Moves an order one packing step on, through the same path as the admin, so
 * the customer hears of it and the history shows who did it. Only the next
 * step is allowed: anything else means the screen is out of date.
 */
export async function moveTillOrder(input: { orderId: string; to: OrderStatusCode }, actor: { id: string }): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { status: true, fulfilmentMethod: true } });
  if (!order) throw new OrderActionError("Order not found.");
  if (packAction(order.status, order.fulfilmentMethod)?.to !== input.to) {
    throw new OrderActionError("This order has moved on since it was opened. Check the list and try again.");
  }
  await updateOrderStatus({ orderId: input.orderId, to: input.to, actorId: actor.id });
}

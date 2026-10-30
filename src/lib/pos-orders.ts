import { formatMoney } from "@/lib/money";
import type { FulfilmentMethodCode, OrderStatusCode, PaymentMethodCode, PaymentStatusCode } from "@/lib/order-status";
import type { SellingUnitCode } from "@/lib/quantity";

/**
 * Website orders on the till, from packing to handing over. One still waiting
 * for online payment is not packed yet, so it stays off; a delivery stays on
 * while the rider has it, until it is marked delivered. Cancelling and
 * recording cash stay in the admin.
 */
export const TILL_ORDER_STATUSES = ["CONFIRMED", "PROCESSING", "READY", "OUT_FOR_DELIVERY"] as const satisfies readonly OrderStatusCode[];
export type TillOrderStatus = (typeof TILL_ORDER_STATUSES)[number];

export interface TillOrderLine {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  unit: SellingUnitCode;
  imageUrl: string | null;
  quantityMilli: number;
}

export interface TillOrder {
  id: string;
  reference: string;
  placedAt: string;
  status: TillOrderStatus;
  customerName: string;
  phone: string;
  fulfilmentMethod: FulfilmentMethodCode;
  zoneName: string | null;
  city: string | null;
  area: string | null;
  addressLine: string | null;
  addressDetails: string | null;
  deliveryInstructions: string | null;
  paymentMethod: PaymentMethodCode;
  paymentStatus: PaymentStatusCode;
  totalMinor: number;
  lines: TillOrderLine[];
}

export interface PackAction {
  to: OrderStatusCode;
  label: string;
}

/** The one step the till offers next, or null when the order is no longer the till's to move. */
export function packAction(status: OrderStatusCode, method: FulfilmentMethodCode): PackAction | null {
  const pickup = method === "PICKUP";
  switch (status) {
    case "CONFIRMED":
      return { to: "PROCESSING", label: "Start packing" };
    case "PROCESSING":
      return { to: "READY", label: pickup ? "Packed, ready for pickup" : "Packed, ready for the rider" };
    case "READY":
      return pickup ? { to: "DELIVERED", label: "Customer has collected it" } : { to: "OUT_FOR_DELIVERY", label: "Given to the rider" };
    case "OUT_FOR_DELIVERY":
      return { to: "DELIVERED", label: "Delivered to the customer" };
    default:
      return null;
  }
}

export type PackStage = "to-pack" | "packing" | "ready" | "out";

export const PACK_STAGES: { stage: PackStage; title: string }[] = [
  { stage: "to-pack", title: "To pack" },
  { stage: "packing", title: "Packing" },
  { stage: "ready", title: "Ready" },
  { stage: "out", title: "With the rider" },
];

const STAGE_OF: Record<TillOrderStatus, PackStage> = { CONFIRMED: "to-pack", PROCESSING: "packing", READY: "ready", OUT_FOR_DELIVERY: "out" };

export function packStage(status: TillOrderStatus): PackStage {
  return STAGE_OF[status];
}

/** Every step an order goes through, and how far this one has got, for the packer to see at a glance. */
export function orderSteps(order: Pick<TillOrder, "status" | "fulfilmentMethod">): { label: string; state: "done" | "now" | "next" }[] {
  const labels =
    order.fulfilmentMethod === "PICKUP"
      ? ["Placed", "Packing", "Ready for pickup", "Collected"]
      : ["Placed", "Packing", "Ready for the rider", "With the rider", "Delivered"];
  const reached = { CONFIRMED: 0, PROCESSING: 1, READY: 2, OUT_FOR_DELIVERY: 3 }[order.status];
  return labels.map((label, index) => ({ label, state: index < reached ? "done" : index === reached ? "now" : "next" }));
}

export function paymentNote(order: Pick<TillOrder, "paymentStatus" | "fulfilmentMethod" | "totalMinor">): string {
  if (order.paymentStatus === "PAID") return "Paid";
  return `Customer pays ${formatMoney(order.totalMinor)} ${order.fulfilmentMethod === "PICKUP" ? "at pickup" : "on delivery"}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function orderAge(placedAt: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(placedAt)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hr")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

import { describe, expect, test } from "vitest";
import { allowedNextStatuses, canTransition, statusLabel, timelineSteps } from "@/lib/order-status";

const delivery = { fulfilmentMethod: "DELIVERY", paymentStatus: "PAID", paymentMethod: "PAYSTACK" } as const;
const codUnpaid = { fulfilmentMethod: "DELIVERY", paymentStatus: "UNPAID", paymentMethod: "CASH_ON_DELIVERY" } as const;
const pickup = { fulfilmentMethod: "PICKUP", paymentStatus: "UNPAID", paymentMethod: "CASH_ON_DELIVERY" } as const;

describe("order status transitions", () => {
  test("follows the fulfilment sequence", () => {
    expect(canTransition("CONFIRMED", "PROCESSING", delivery).ok).toBe(true);
    expect(canTransition("PROCESSING", "READY", delivery).ok).toBe(true);
    expect(canTransition("READY", "OUT_FOR_DELIVERY", delivery).ok).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", delivery).ok).toBe(true);
  });

  test("staff cannot mark an online order confirmed without verified payment", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED", delivery).ok).toBe(false);
  });

  test("final states cannot change", () => {
    expect(allowedNextStatuses("DELIVERED", delivery)).toEqual([]);
    expect(allowedNextStatuses("CANCELLED", delivery)).toEqual([]);
  });

  test("paid orders cannot be cancelled without a refund", () => {
    const result = canTransition("CONFIRMED", "CANCELLED", delivery);
    expect(result.ok).toBe(false);
  });

  test("unpaid cash-on-delivery orders can be cancelled", () => {
    expect(canTransition("CONFIRMED", "CANCELLED", codUnpaid).ok).toBe(true);
  });

  test("pickup orders skip out-for-delivery", () => {
    expect(canTransition("READY", "OUT_FOR_DELIVERY", pickup).ok).toBe(false);
    expect(canTransition("READY", "DELIVERED", pickup).ok).toBe(true);
    expect(statusLabel("DELIVERED", "PICKUP")).toBe("Collected");
    expect(timelineSteps("PICKUP")).not.toContain("OUT_FOR_DELIVERY");
  });

  test("online orders cannot be delivered while payment is unverified", () => {
    const unpaidOnline = { fulfilmentMethod: "DELIVERY", paymentStatus: "PENDING", paymentMethod: "PAYSTACK" } as const;
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", unpaidOnline).ok).toBe(false);
  });
});

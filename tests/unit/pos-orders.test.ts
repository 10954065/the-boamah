import { describe, expect, test } from "vitest";
import { orderAge, orderSteps, packAction, packStage, paymentNote } from "@/lib/pos-orders";

const MINUTE = 60_000;
const NOW = Date.parse("2026-10-30T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * MINUTE).toISOString();

describe("the next packing step", () => {
  test("a new order is started, whichever way it leaves the shop", () => {
    expect(packAction("CONFIRMED", "DELIVERY")).toEqual({ to: "PROCESSING", label: "Start packing" });
    expect(packAction("CONFIRMED", "PICKUP")).toEqual({ to: "PROCESSING", label: "Start packing" });
  });

  test("an order being packed is finished for pickup or for the rider", () => {
    expect(packAction("PROCESSING", "PICKUP")).toEqual({ to: "READY", label: "Packed, ready for pickup" });
    expect(packAction("PROCESSING", "DELIVERY")).toEqual({ to: "READY", label: "Packed, ready for the rider" });
  });

  test("a ready order is handed over", () => {
    expect(packAction("READY", "PICKUP")).toEqual({ to: "DELIVERED", label: "Customer has collected it" });
    expect(packAction("READY", "DELIVERY")).toEqual({ to: "OUT_FOR_DELIVERY", label: "Given to the rider" });
  });

  test("a delivery with the rider is marked delivered", () => {
    expect(packAction("OUT_FOR_DELIVERY", "DELIVERY")).toEqual({ to: "DELIVERED", label: "Delivered to the customer" });
  });

  test.each(["PENDING_PAYMENT", "DELIVERED", "CANCELLED"] as const)("%s has no step at the till", (status) => {
    expect(packAction(status, "DELIVERY")).toBeNull();
  });
});

describe("the steps an order shows", () => {
  test("a delivery being packed has been placed, is packing, and has three steps to go", () => {
    expect(orderSteps({ status: "PROCESSING", fulfilmentMethod: "DELIVERY" })).toEqual([
      { label: "Placed", state: "done" },
      { label: "Packing", state: "now" },
      { label: "Ready for the rider", state: "next" },
      { label: "With the rider", state: "next" },
      { label: "Delivered", state: "next" },
    ]);
  });

  test("a pickup waiting at the counter has one step left", () => {
    expect(orderSteps({ status: "READY", fulfilmentMethod: "PICKUP" }).map((step) => step.state)).toEqual(["done", "done", "now", "next"]);
  });
});

describe("which column an order sits in", () => {
  test("follows its status", () => {
    expect(packStage("CONFIRMED")).toBe("to-pack");
    expect(packStage("PROCESSING")).toBe("packing");
    expect(packStage("READY")).toBe("ready");
    expect(packStage("OUT_FOR_DELIVERY")).toBe("out");
  });
});

describe("what the packer is told about payment", () => {
  test("a paid order says so", () => {
    expect(paymentNote({ paymentStatus: "PAID", fulfilmentMethod: "DELIVERY", totalMinor: 5000 })).toBe("Paid");
  });

  test("an unpaid order says how much to collect, and when", () => {
    expect(paymentNote({ paymentStatus: "UNPAID", fulfilmentMethod: "DELIVERY", totalMinor: 5000 })).toBe("Customer pays GH₵50.00 on delivery");
    expect(paymentNote({ paymentStatus: "UNPAID", fulfilmentMethod: "PICKUP", totalMinor: 5000 })).toBe("Customer pays GH₵50.00 at pickup");
  });
});

describe("how long an order has been waiting", () => {
  test.each([
    [0, "Just now"],
    [1, "1 min ago"],
    [45, "45 min ago"],
    [60, "1 hr ago"],
    [125, "2 hrs ago"],
    [1440, "1 day ago"],
    [4320, "3 days ago"],
  ])("%i minutes", (minutes, expected) => {
    expect(orderAge(ago(minutes), NOW)).toBe(expected);
  });

  test("a clock a little behind the server never shows a time in the future", () => {
    expect(orderAge(ago(-3), NOW)).toBe("Just now");
  });
});

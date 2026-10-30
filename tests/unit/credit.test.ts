import { describe, expect, test } from "vitest";
import { creditCustomerSchema, creditPaymentSchema, creditProblem, withRunningBalance } from "@/lib/credit";

describe("credit customers", () => {
  test("a customer needs a name and a Ghana number, kept in one form so nobody is added twice", () => {
    const parsed = creditCustomerSchema.parse({ name: " Ama Boateng ", phone: "+233 24 555 1234" });
    expect(parsed).toMatchObject({ name: "Ama Boateng", phone: "0245551234" });
    expect(creditCustomerSchema.parse({ name: "Kofi", phone: "024-555-1234" }).phone).toBe("0245551234");
    expect(creditCustomerSchema.safeParse({ name: "K", phone: "0245551234" }).success).toBe(false);
    expect(creditCustomerSchema.safeParse({ name: "Kofi", phone: "12345" }).success).toBe(false);
  });

  test("a limit is optional and never below zero", () => {
    expect(creditCustomerSchema.parse({ name: "Kofi", phone: "0245551234" }).limitMinor).toBeNull();
    expect(creditCustomerSchema.parse({ name: "Kofi", phone: "0245551234", limitMinor: 50_000 }).limitMinor).toBe(50_000);
    expect(creditCustomerSchema.safeParse({ name: "Kofi", phone: "0245551234", limitMinor: -1 }).success).toBe(false);
  });
});

describe("what can go on account", () => {
  const customer = { isActive: true, balanceMinor: 30_000, limitMinor: 50_000 };

  test("up to the limit, and anything when there is no limit", () => {
    expect(creditProblem(customer, 20_000)).toBeNull();
    expect(creditProblem(customer, 20_001)).toMatch(/GH₵200\.00 more/);
    expect(creditProblem({ ...customer, limitMinor: null }, 9_000_000)).toBeNull();
  });

  test("nothing once credit is stopped", () => {
    expect(creditProblem({ ...customer, isActive: false }, 100)).toMatch(/cannot buy on credit/);
  });
});

describe("credit payments", () => {
  const valid = { clientId: crypto.randomUUID(), customerId: "c1", amountMinor: 5000, method: "CASH" };

  test("cash, card or mobile money, with the transaction ID for mobile money", () => {
    expect(creditPaymentSchema.safeParse(valid).success).toBe(true);
    expect(creditPaymentSchema.safeParse({ ...valid, method: "MOMO" }).success).toBe(false);
    expect(creditPaymentSchema.safeParse({ ...valid, method: "MOMO", reference: "MP2610301234" }).success).toBe(true);
    expect(creditPaymentSchema.safeParse({ ...valid, method: "CREDIT" }).success).toBe(false);
    expect(creditPaymentSchema.safeParse({ ...valid, amountMinor: 0 }).success).toBe(false);
  });
});

describe("statements", () => {
  test("each line shows what is owed after it, oldest first", () => {
    const lines = withRunningBalance([
      { id: "s1", kind: "sale", at: "2026-10-01T10:00:00Z", amountMinor: 20_000, label: "T1-000010" },
      { id: "p1", kind: "payment", at: "2026-10-03T10:00:00Z", amountMinor: -5_000, label: "Cash" },
      { id: "s2", kind: "sale", at: "2026-10-02T10:00:00Z", amountMinor: 10_000, label: "T1-000020" },
      { id: "r1", kind: "return", at: "2026-10-04T10:00:00Z", amountMinor: -2_000, label: "RF-000003" },
    ]);
    expect(lines.map((line) => [line.id, line.balanceAfterMinor])).toEqual([
      ["s1", 20_000],
      ["s2", 30_000],
      ["p1", 25_000],
      ["r1", 23_000],
    ]);
  });
});

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { SaleTenderCode } from "@/lib/pos";
import { addCreditCustomer, creditCustomerDetail, creditTotals, listCreditCustomers, recordCreditPayment, tillCreditCustomers, updateCreditCustomer } from "@/server/credit";
import { saleRecord } from "@/server/pos/history";
import { recordPosReturn } from "@/server/pos/returns";
import { recordPosSale } from "@/server/pos/sales";
import { closePosShift, openPosShift } from "@/server/pos/shifts";
import { voidPosSale } from "@/server/pos/voids";
import { createStaff, createStaffWithPassword, createTill, createVariant, resetDatabase } from "./factories";

beforeEach(resetDatabase);

const NOW = new Date("2026-11-02T18:00:00Z");
const PASSWORD = "manager-password-123";
let receipt = 0;

/** A till with a cashier's open shift (GH₵200 float), a manager, a GH₵25 item and a credit customer, Ama. */
async function shop() {
  await createTill();
  const cashier = await createStaff();
  const manager = await createStaffWithPassword(PASSWORD);
  const { variant } = await createVariant({ price: 2500, stock: 100_000 });
  const opened = await openPosShift({ clientId: randomUUID(), tillCode: "T1", openedAt: "2026-11-02T08:00:00Z", openingFloatMinor: 20_000 }, cashier, NOW);
  if (opened.status === "rejected") throw new Error(opened.error);
  const added = await addCreditCustomer({ name: "Ama Boateng", phone: "+233 24 555 1234", limitMinor: 50_000 }, manager.id);
  if (!added.ok) throw new Error(added.error);
  receipt = 0;

  /** Sells `count` of the item, paid as given. */
  const sell = async (count: number, payments: { method: SaleTenderCode; amountMinor: number }[], customerId: string | null = added.customer.id) => {
    receipt += 1;
    const result = await recordPosSale(
      {
        clientId: randomUUID(),
        receiptNumber: `T1-${String(receipt).padStart(6, "0")}`,
        tillCode: "T1",
        shiftClientId: opened.shift.clientId,
        cashierId: cashier.id,
        soldAt: "2026-11-02T12:00:00Z",
        items: [{ variantId: variant.id, quantityMilli: count * 1000, unitPriceMinor: 2500 }],
        payments,
        creditCustomerId: payments.some((p) => p.method === "CREDIT") ? customerId : null,
      },
      NOW,
    );
    if (result.status === "rejected") throw new Error(result.error);
    return result.saleId;
  };
  const owed = async () => (await creditCustomerDetail(added.customer.id))!.owedMinor;
  return { cashier, manager, shift: opened.shift, customer: added.customer, sell, owed };
}

const pay = (customerId: string, amountMinor: number, method: "CASH" | "MOMO" | "CARD" = "CASH") => ({
  clientId: randomUUID(),
  customerId,
  amountMinor,
  method,
  reference: method === "MOMO" ? "MP26110201" : null,
});

describe("credit customers", () => {
  test("a number can belong to only one customer, whichever way it is written", async () => {
    const { manager, customer } = await shop();
    expect(customer.phone).toBe("0245551234");
    expect(await addCreditCustomer({ name: "Someone Else", phone: "024 555 1234" }, manager.id)).toMatchObject({ ok: false, field: "phone" });
  });

  test("a sale on account adds to what the customer owes, and its receipt names them", async () => {
    const { customer, sell, owed } = await shop();
    const saleId = await sell(4, [{ method: "CREDIT", amountMinor: 10_000 }]);
    await sell(2, [{ method: "CASH", amountMinor: 2000 }, { method: "CREDIT", amountMinor: 3000 }]);

    expect(await owed()).toBe(13_000);
    expect((await saleRecord({ id: saleId }))!.creditCustomer).toEqual({ id: customer.id, name: "Ama Boateng", phone: "0245551234" });
    expect((await tillCreditCustomers())[0]).toMatchObject({ id: customer.id, balanceMinor: 13_000, limitMinor: 50_000, isActive: true });
    expect(await creditTotals()).toEqual({ owedMinor: 13_000, customersOwing: 1 });
  });

  test("a sale on account needs a customer who exists", async () => {
    const { sell } = await shop();
    await expect(sell(1, [{ method: "CREDIT", amountMinor: 2500 }], "no-such-customer")).rejects.toThrow(/credit customer/);
  });

  test("a payment at the till lowers what is owed, goes into the shift's drawer, and is recorded once", async () => {
    const { cashier, shift, customer, sell, owed } = await shop();
    await sell(4, [{ method: "CREDIT", amountMinor: 10_000 }]);

    const payment = pay(customer.id, 4000);
    const first = await recordCreditPayment(payment, cashier.id, shift.clientId);
    const again = await recordCreditPayment(payment, cashier.id, shift.clientId);
    expect(first).toMatchObject({ status: "recorded", payment: { amountMinor: 4000, owedAfterMinor: 6000, customerName: "Ama Boateng" } });
    expect(again.status).toBe("duplicate");
    expect(await owed()).toBe(6000);

    const closed = await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 24_000, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);
    if (closed.status === "rejected") throw new Error(closed.error);
    expect(closed.summary).toMatchObject({ onCreditMinor: 10_000, creditPaidMinor: { CASH: 4000, MOMO: 0, CARD: 0 }, expectedMinor: { CASH: 24_000, MOMO: 0, CARD: 0 } });
  });

  test("nobody can pay more than they owe, or pay into another cashier's shift", async () => {
    const { manager, shift, customer, sell } = await shop();
    expect(await recordCreditPayment(pay(customer.id, 100), manager.id)).toMatchObject({ status: "rejected", error: expect.stringMatching(/does not owe/) });
    await sell(2, [{ method: "CREDIT", amountMinor: 5000 }]);
    expect(await recordCreditPayment(pay(customer.id, 5001), manager.id)).toMatchObject({ status: "rejected", error: expect.stringMatching(/owes GH₵50\.00/) });
    expect(await recordCreditPayment(pay(customer.id, 1000), manager.id, shift.clientId)).toMatchObject({ status: "rejected", error: expect.stringMatching(/another cashier/) });
    // In the admin, with no shift.
    expect(await recordCreditPayment(pay(customer.id, 1000, "MOMO"), manager.id)).toMatchObject({ status: "recorded", payment: { owedAfterMinor: 4000 } });
  });

  test("a voided sale on account is owed no more, and goods brought back come off the account", async () => {
    const { cashier, manager, shift, customer, sell, owed } = await shop();
    const voided = await sell(2, [{ method: "CREDIT", amountMinor: 5000 }]);
    const kept = await sell(4, [{ method: "CREDIT", amountMinor: 10_000 }]);
    expect(await owed()).toBe(15_000);

    await voidPosSale({ saleId: voided, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: { email: manager.email, password: PASSWORD } }, cashier, NOW);
    expect(await owed()).toBe(10_000);

    const line = (await saleRecord({ id: kept }))!.lines[0]!;
    const returned = await recordPosReturn(
      {
        clientId: randomUUID(),
        saleId: kept,
        tillCode: "T1",
        shiftClientId: shift.clientId,
        items: [{ saleItemId: line.id, quantityMilli: 1000, restock: true }],
        method: "CREDIT",
        reason: "Damaged packaging",
        approval: { email: manager.email, password: PASSWORD },
      },
      cashier,
    );
    expect(returned.status).toBe("recorded");
    expect(await owed()).toBe(7500);

    // The sales carry the test's till time; the return is stamped with the real clock. Put it after them, as it would be.
    await prisma.posReturn.updateMany({ data: { createdAt: NOW } });
    const statement = (await creditCustomerDetail(customer.id))!.statement;
    expect(statement.map((entry) => [entry.kind, entry.amountMinor, entry.balanceAfterMinor])).toEqual([
      ["sale", 10_000, 10_000],
      ["return", -2500, 7500],
    ]);
  });

  test("only a sale on account can be given back onto an account", async () => {
    const { cashier, manager, shift, sell } = await shop();
    const cashSale = await sell(2, [{ method: "CASH", amountMinor: 5000 }]);
    const line = (await saleRecord({ id: cashSale }))!.lines[0]!;
    const result = await recordPosReturn(
      {
        clientId: randomUUID(),
        saleId: cashSale,
        tillCode: "T1",
        shiftClientId: shift.clientId,
        items: [{ saleItemId: line.id, quantityMilli: 1000, restock: true }],
        method: "CREDIT",
        reason: "Damaged packaging",
        approval: { email: manager.email, password: PASSWORD },
      },
      cashier,
    );
    expect(result).toMatchObject({ status: "rejected", error: expect.stringMatching(/not put on a customer's account/) });
  });

  test("stopping credit and setting a limit show on the list; payments are still taken", async () => {
    const { manager, customer, sell } = await shop();
    await sell(2, [{ method: "CREDIT", amountMinor: 5000 }]);
    const updated = await updateCreditCustomer(customer.id, { name: "Ama Boateng", phone: "0245551234", limitMinor: 20_000 }, false, manager.id);
    expect(updated).toMatchObject({ ok: true, customer: { isActive: false, limitMinor: 20_000 } });
    expect((await listCreditCustomers("ama"))[0]).toMatchObject({ isActive: false, owedMinor: 5000 });
    expect((await listCreditCustomers("0245"))[0]?.id).toBe(customer.id);
    expect(await recordCreditPayment(pay(customer.id, 5000), manager.id)).toMatchObject({ status: "recorded", payment: { owedAfterMinor: 0 } });
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "credit." } } })).toBe(3);
  });
});

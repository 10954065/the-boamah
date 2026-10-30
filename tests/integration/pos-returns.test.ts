import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { newEntryState, type SaleEntry } from "@/lib/pos-outbox";
import type { PosReturnInput } from "@/lib/pos-returns";
import { saleRecord, shiftHistory } from "@/server/pos/history";
import { recordRemoval } from "@/server/pos/removals";
import { markTillReviewed, tillReport, tillReviewQueue, tillShifts } from "@/server/pos/reports";
import { recordPosReturn } from "@/server/pos/returns";
import { recordPosSale } from "@/server/pos/sales";
import { closePosShift, openPosShift } from "@/server/pos/shifts";
import { voidPosSale } from "@/server/pos/voids";
import { createStaff, createStaffWithPassword, createTill, createVariant, resetDatabase } from "./factories";

beforeEach(resetDatabase);

const NOW = new Date("2026-11-02T18:00:00Z");
const PASSWORD = "manager-password-123";

/** A till with a cashier's open shift and one cash sale: 4 of an item at 25.00 and 1.5 kg at 19.99. */
async function shopWithSale() {
  await createTill();
  const cashier = await createStaff();
  const manager = await createStaffWithPassword(PASSWORD);
  const { variant: soap } = await createVariant({ price: 2500, stock: 10_000 });
  const { variant: tomatoes } = await createVariant({ price: 1999, stock: 20_000, unit: "KG" });
  const opened = await openPosShift({ clientId: randomUUID(), tillCode: "T1", openedAt: "2026-11-02T08:00:00Z", openingFloatMinor: 20_000 }, cashier, NOW);
  if (opened.status === "rejected") throw new Error(opened.error);
  const sold = await recordPosSale(
    {
      clientId: randomUUID(),
      receiptNumber: "T1-000001",
      tillCode: "T1",
      shiftClientId: opened.shift.clientId,
      cashierId: cashier.id,
      soldAt: "2026-11-02T12:00:00Z",
      items: [
        { variantId: soap.id, quantityMilli: 4000, unitPriceMinor: 2500 },
        { variantId: tomatoes.id, quantityMilli: 1500, unitPriceMinor: 1999 },
      ],
      payments: [{ method: "CASH", amountMinor: 15_000 }],
    },
    NOW,
  );
  if (sold.status === "rejected") throw new Error(sold.error);
  const sale = (await saleRecord({ id: sold.saleId }))!;
  const lineFor = async (variantId: string) => {
    const item = await prisma.posSaleItem.findFirstOrThrow({ where: { saleId: sale.id, variantId } });
    return sale.lines.find((line) => line.id === item.id)!;
  };
  return { cashier, manager, soap, tomatoes, shift: opened.shift, sale, soapLine: await lineFor(soap.id), tomatoLine: await lineFor(tomatoes.id) };
}

const stockOf = async (variantId: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockMilli;
const approval = (manager: { email: string }, password = PASSWORD) => ({ email: manager.email, password });

describe("voiding a sale", () => {
  test("puts everything back on the shelf, leaves the sale out of the shift's takings, and is recorded once", async () => {
    const { cashier, manager, soap, tomatoes, shift, sale } = await shopWithSale();

    const result = await voidPosSale({ saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: approval(manager) }, cashier, NOW);
    const again = await voidPosSale({ saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: approval(manager) }, cashier, NOW);

    expect(result).toMatchObject({ status: "voided", sale: { status: "VOIDED", voided: { byName: manager.name, reason: "Rung up by mistake" } } });
    expect(again.status).toBe("duplicate");
    expect(await stockOf(soap.id)).toBe(10_000);
    expect(await stockOf(tomatoes.id)).toBe(20_000);
    expect(await prisma.inventoryMovement.count({ where: { type: "POS_VOID" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "pos.sale.void", actorId: manager.id } })).toBe(1);

    const closed = await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 20_000, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);
    expect(closed).toMatchObject({ status: "closed", summary: { salesCount: 0, voidsCount: 1, voidedTotalMinor: 12_999, expectedMinor: { CASH: 20_000 } } });
  });

  test("needs a manager: a cashier alone, wrong details or a cashier's details are refused", async () => {
    const { cashier, shift, sale } = await shopWithSale();
    const otherCashier = await createStaffWithPassword("cashier-password-1", "CASHIER");
    const input = { saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake" };

    expect(await voidPosSale(input, cashier, NOW)).toMatchObject({ status: "rejected", error: "A manager needs to approve this." });
    expect(await voidPosSale({ ...input, approval: { email: "nobody@example.com", password: PASSWORD } }, cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/not right/) });
    expect(await voidPosSale({ ...input, approval: approval(otherCashier, "cashier-password-1") }, cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/cannot approve/) });
    expect((await saleRecord({ id: sale.id }))?.status).toBe("COMPLETED");
  });

  test("a signed-in manager approves by themselves", async () => {
    const { shift, sale } = await shopWithSale();
    const manager = await createStaff("STORE_MANAGER");

    expect(await voidPosSale({ saleId: sale.id, shiftClientId: shift.clientId, reason: "Payment did not go through" }, manager, NOW)).toMatchObject({ status: "voided" });
  });

  test("only in the sale's own shift while it is open, and not once goods have come back", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    const input = { saleId: sale.id, shiftClientId: randomUUID(), reason: "Rung up by mistake", approval: approval(manager) };

    expect(await voidPosSale(input, cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/^Only sales from the shift open now/) });

    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager), cashier);
    expect(await voidPosSale({ ...input, shiftClientId: shift.clientId }, cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/have been returned/) });
  });

  test("stops taking approvals after five wrong ones, and records each wrong one", async () => {
    const { cashier, manager, shift, sale } = await shopWithSale();
    const input = { saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: approval(manager, "wrong-password") };
    for (let i = 0; i < 5; i += 1) expect(await voidPosSale(input, cashier, NOW)).toMatchObject({ error: expect.stringMatching(/not right/) });

    expect(await voidPosSale({ ...input, approval: approval(manager) }, cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/Too many wrong manager details/) });
    expect(await prisma.auditLog.count({ where: { action: "pos.approval.failed", actorId: cashier.id } })).toBe(5);
    // Another cashier is held back too: the manager's own email has had too many wrong tries.
    expect(await voidPosSale({ ...input, approval: approval(manager) }, await createStaff(), NOW)).toMatchObject({ error: expect.stringMatching(/Too many wrong manager details/) });
  });

  test("approvals that go through never run out", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    for (let i = 0; i < 4; i += 1) {
      const result = await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager), cashier);
      expect(result.status).toBe("recorded");
    }
    expect(await voidPosSale({ saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: approval(manager) }, cashier, NOW)).toMatchObject({
      error: expect.stringMatching(/have been returned/),
    });
    expect(await prisma.auditLog.count({ where: { action: "pos.approval.failed" } })).toBe(0);
  });
});

function returnOf(saleId: string, shiftClientId: string, items: PosReturnInput["items"], manager: { email: string }, overrides: Partial<PosReturnInput> = {}): PosReturnInput {
  return { clientId: randomUUID(), saleId, tillCode: "T1", shiftClientId, items, method: "CASH", reason: "Damaged or faulty", approval: approval(manager), ...overrides };
}

describe("returning goods", () => {
  test("gives back the price charged, puts sellable goods back, and takes the refund off the shift's cash", async () => {
    const { cashier, manager, soap, tomatoes, shift, sale, soapLine, tomatoLine } = await shopWithSale();

    const result = await recordPosReturn(
      returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }, { saleItemId: tomatoLine.id, quantityMilli: 500, restock: false }], manager),
      cashier,
    );

    expect(result).toMatchObject({ status: "recorded", refund: { number: "RF-000001", refundMinor: 3500, method: "CASH", approvedByName: manager.name, receiptNumber: "T1-000001" } });
    if (result.status === "rejected") return;
    expect(result.sale.lines.find((l) => l.id === soapLine.id)).toMatchObject({ returnedMilli: 1000, refundedMinor: 2500 });
    expect(result.sale.lines.find((l) => l.id === tomatoLine.id)).toMatchObject({ returnedMilli: 500, refundedMinor: 1000 });
    expect(await stockOf(soap.id)).toBe(7000); // 10 less 4 sold, 1 back
    expect(await stockOf(tomatoes.id)).toBe(18_500); // the bruised half kilo is not sold again

    const closed = await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 0, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);
    expect(closed).toMatchObject({ summary: { salesTotalMinor: 12_999, refundsCount: 1, refundedMinor: { CASH: 3500 }, expectedMinor: { CASH: 20_000 + 12_999 - 3500 } } });
  });

  test("the last of a line gives back exactly what is left, and nothing more can come back", async () => {
    const { cashier, manager, shift, sale, tomatoLine } = await shopWithSale();
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: tomatoLine.id, quantityMilli: 500, restock: true }], manager), cashier);

    const rest = await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: tomatoLine.id, quantityMilli: 1000, restock: true }], manager), cashier);
    const more = await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: tomatoLine.id, quantityMilli: 1, restock: true }], manager), cashier);

    expect(rest).toMatchObject({ status: "recorded", refund: { refundMinor: 1999 } });
    expect(more).toMatchObject({ status: "rejected", error: expect.stringMatching(/already been returned/) });
  });

  test("sending the same return again records it once", async () => {
    const { cashier, manager, soap, shift, sale, soapLine } = await shopWithSale();
    const input = returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 2000, restock: true }], manager);

    const [first, second] = await Promise.all([recordPosReturn(input, cashier), recordPosReturn(input, cashier)]);

    expect([first.status, second.status].toSorted()).toEqual(["duplicate", "recorded"]);
    expect(await prisma.posReturn.count()).toBe(1);
    expect(await stockOf(soap.id)).toBe(8000);
  });

  test("refuses more than was sold, half a unit, a voided sale, and a mobile money refund without its ID", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    const items = (quantityMilli: number) => [{ saleItemId: soapLine.id, quantityMilli, restock: true }];

    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items(5000), manager), cashier)).toMatchObject({ status: "rejected", error: expect.stringMatching(/^Only 4 items/) });
    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items(500), manager), cashier)).toMatchObject({ status: "rejected", error: expect.stringMatching(/whole items/) });
    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items(1000), manager, { method: "MOMO" }), cashier)).toMatchObject({ status: "rejected", error: expect.stringMatching(/transaction ID/) });

    await voidPosSale({ saleId: sale.id, shiftClientId: shift.clientId, reason: "Rung up by mistake", approval: approval(manager) }, cashier, NOW);
    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items(1000), manager), cashier)).toMatchObject({ status: "rejected", error: expect.stringMatching(/was voided/) });
    expect(await prisma.posReturn.count()).toBe(0);
  });

  test("is paid out of the cashier's own open shift on this till", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    const other = await createStaff();
    const items = [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }];

    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items, manager), other)).toMatchObject({ status: "rejected", error: expect.stringMatching(/another cashier/) });
    await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 0, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);
    expect(await recordPosReturn(returnOf(sale.id, shift.clientId, items, manager), cashier)).toMatchObject({ status: "rejected", error: expect.stringMatching(/Open a shift first/) });
  });
});

describe("the till's sales list", () => {
  test("shows a shift's sales and refunds to its cashier and to managers only", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager), cashier);

    const history = await shiftHistory(shift.clientId, cashier);

    expect(history.sales.map((s) => s.receiptNumber)).toEqual(["T1-000001"]);
    expect(history.refunds).toHaveLength(1);
    expect(await shiftHistory(shift.clientId, manager)).toMatchObject({ sales: [{ receiptNumber: "T1-000001" }] });
    await expect(shiftHistory(shift.clientId, await createStaff())).rejects.toThrow(/another cashier/);
    expect(await saleRecord({ receiptNumber: "T1-000001" })).toMatchObject({ shiftOpen: true, refunds: [{ number: "RF-000001" }] });
  });
});

describe("removing something the shop's system refused", () => {
  function refusedSale(cashierId: string): SaleEntry {
    return {
      kind: "sale",
      id: randomUUID(),
      cashierId,
      cashierName: "Ama",
      createdAt: "2026-11-02T12:00:00.000Z",
      ...newEntryState,
      status: "refused",
      error: "Till T1 is not set up or has been switched off.",
      refusedAt: "2026-11-02T12:01:00.000Z",
      renumbered: 0,
      upload: {
        clientId: randomUUID(),
        receiptNumber: "T1-000009",
        tillCode: "T1",
        shiftClientId: null,
        cashierId,
        soldAt: "2026-11-02T12:00:00.000Z",
        items: [{ variantId: "v1", quantityMilli: 1000, unitPriceMinor: 900 }],
        payments: [{ method: "CASH", amountMinor: 900 }],
      },
      receipt: {
        receiptNumber: "T1-000009",
        soldAt: "2026-11-02T12:00:00.000Z",
        tillCode: "T1",
        cashierName: "Ama",
        lines: [{ name: "Bread", detail: "Sliced", unit: "LOAF", quantityMilli: 1000, unitPriceMinor: 900, lineTotalMinor: 900, savingMinor: 0 }],
        totalMinor: 900,
        savingMinor: 0,
        payments: [{ method: "CASH", amountMinor: 900 }],
        paidMinor: 900,
        changeMinor: 0,
      },
    };
  }

  test("keeps a record of the sale and who approved removing it", async () => {
    await createTill();
    const cashier = await createStaff();
    const manager = await createStaffWithPassword(PASSWORD);
    const entry = refusedSale(cashier.id);

    expect(await recordRemoval({ tillCode: "T1", entry, reason: "Customer got their money back" }, cashier)).toMatchObject({ status: "rejected", error: "A manager needs to approve this." });
    expect(await recordRemoval({ tillCode: "T1", entry, reason: "Customer got their money back", approval: approval(manager) }, cashier)).toEqual({ status: "recorded" });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "pos.entry.removed" } });
    expect(log).toMatchObject({ actorId: manager.id, entityType: "PosTill", entityId: "T1" });
    expect(log.details).toMatchObject({ kind: "sale", receiptNumber: "T1-000009", totalMinor: 900, reason: "Customer got their money back", atTillBy: cashier.id, lines: [{ name: "Bread" }] });
  });

  test("refuses entries still waiting to be sent, and another cashier's", async () => {
    await createTill();
    const cashier = await createStaff();
    const manager = await createStaffWithPassword(PASSWORD);
    const waiting = { ...refusedSale(cashier.id), ...newEntryState };

    expect(await recordRemoval({ tillCode: "T1", entry: waiting, reason: "Mistake", approval: approval(manager) }, cashier)).toMatchObject({ status: "rejected" });
    expect(await recordRemoval({ tillCode: "T1", entry: refusedSale(cashier.id), reason: "Mistake", approval: approval(manager) }, await createStaff())).toMatchObject({ status: "rejected" });
    expect(await recordRemoval({ tillCode: "T2", entry: refusedSale(cashier.id), reason: "Mistake", approval: approval(manager) }, cashier)).toMatchObject({ error: "This does not belong to this till." });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  test("records the total the items come to, not the total the till printed", async () => {
    await createTill();
    const cashier = await createStaff();
    const manager = await createStaffWithPassword(PASSWORD);
    const entry = refusedSale(cashier.id);
    const tampered = { ...entry, cashierName: "x".repeat(5000), receipt: { ...entry.receipt, totalMinor: 1 } };

    await recordRemoval({ tillCode: "T1", entry: tampered, reason: "Customer got their money back", approval: approval(manager) }, cashier);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "pos.entry.removed" } });
    expect(log.details).toMatchObject({ totalMinor: 900, reportedByTill: true });
    expect(((log.details as { cashierName: string }).cashierName).length).toBe(200);
  });
});

describe("the admin's till pages", () => {
  const DAY = { start: new Date("2026-11-02T00:00:00Z"), end: new Date("2026-11-03T00:00:00Z"), from: "2026-11-02", to: "2026-11-02", days: 1 };

  test("report takings as sales less refunds, by method and cashier, leaving voids out", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager), cashier);
    await prisma.posReturn.updateMany({ data: { createdAt: new Date("2026-11-02T13:00:00Z") } });

    const report = await tillReport(DAY);

    expect(report).toMatchObject({
      salesCount: 1,
      salesTotalMinor: 12_999,
      takenMinor: { CASH: 12_999, MOMO: 0, CARD: 0 },
      refundsCount: 1,
      refundedMinor: { CASH: 2500 },
      netMinor: { CASH: 10_499 },
      voidsCount: 0,
      byCashier: [{ id: cashier.id, salesCount: 1, salesTotalMinor: 12_999, refundedMinor: 2500 }],
      daily: [{ day: "2026-11-02", salesCount: 1, salesTotalMinor: 12_999, refundedMinor: 2500 }],
    });
    expect(report.topProducts[0]).toMatchObject({ revenueMinor: 10_000, quantityMilli: 4000, returnedMilli: 1000 });
    expect(await tillReport({ ...DAY, start: new Date("2026-11-03T00:00:00Z"), end: new Date("2026-11-04T00:00:00Z") })).toMatchObject({ salesCount: 0, refundsCount: 0 });
  });

  test("list what needs a manager until it is marked as looked at", async () => {
    const { cashier, manager, shift, sale, soapLine } = await shopWithSale();
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager), cashier);
    await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 20_000, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);

    const before = await tillReviewQueue(NOW);
    expect(before.refunds).toHaveLength(1);
    expect(before.shifts).toHaveLength(1); // 20,000 counted against 30,499 expected
    expect(before.shifts[0]!.difference).toEqual({ CASH: -10_499, MOMO: 0, CARD: 0 });

    expect(await markTillReviewed("shift", before.shifts[0]!.id, "Cash taken to the bank early", manager.id)).toBe(true);
    expect(await markTillReviewed("shift", before.shifts[0]!.id, "Again", manager.id)).toBe(false);
    expect(await markTillReviewed("return", before.refunds[0]!.id, null, manager.id)).toBe(true);

    expect(await tillReviewQueue(NOW)).toMatchObject({ count: 0 });
    expect(await prisma.auditLog.count({ where: { action: "pos.review" } })).toBe(2);
    const { rows } = await tillShifts("closed", 1, 10);
    expect(rows[0]).toMatchObject({ reviewNote: "Cash taken to the bank early", summary: { refundsCount: 1 } });
  });

  test("leave counts that balanced off the review list, with change and refunds by every method", async () => {
    const { cashier, manager, shift, sale, soapLine, tomatoLine } = await shopWithSale(); // 129.99 cash, 20.01 change, 200.00 float
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: soapLine.id, quantityMilli: 1000, restock: true }], manager, { method: "MOMO", reference: "MP1" }), cashier);
    await recordPosReturn(returnOf(sale.id, shift.clientId, [{ saleItemId: tomatoLine.id, quantityMilli: 500, restock: true }], manager, { method: "CARD" }), cashier);
    // Cash balances (200.00 float + 150.00 paid less 20.01 change); mobile money and card each paid a refund out (25.00 and 10.00).
    const closed = await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T17:00:00Z", countedCashMinor: 32_999, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);
    expect(closed.status).toBe("closed");

    const queue = await tillReviewQueue(NOW);
    // Mobile money and card were each 0 counted against a refund paid out: those two do not balance.
    expect(queue.shifts.map((s) => s.difference)).toEqual([{ CASH: 0, MOMO: 2500, CARD: 1000 }]);

    await prisma.posShift.update({ where: { clientId: shift.clientId }, data: { countedMomoMinor: 0, countedCardMinor: 0, countedCashMinor: 32_999 } });
    await prisma.posReturn.deleteMany({ where: { method: { in: ["MOMO", "CARD"] } } });
    expect((await tillReviewQueue(NOW)).shifts).toHaveLength(0);
  });
});

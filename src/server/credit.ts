import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import {
  creditCustomerSchema,
  withRunningBalance,
  type CreditPaymentInput,
  type CreditPaymentResult,
  type RecordedCreditPayment,
  type StatementEntry,
  type TillCreditCustomer,
} from "@/lib/credit";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, type PosTenderCode } from "@/lib/pos";
import { formatRefundNumber } from "@/lib/pos-returns";
import { recordAudit } from "@/server/audit";

/**
 * Credit customers and what they owe. A balance is never stored: it is the
 * CREDIT part of the customer's completed till sales, less goods brought
 * back onto the account, less the payments they made.
 */

interface Balance {
  owedMinor: number;
  lastPaidAt: Date | null;
}

/** What each customer owes (all of them, or the ones named). */
async function balances(tx: Tx | typeof prisma, ids?: readonly string[]): Promise<Map<string, Balance>> {
  const only = ids ? Prisma.sql`WHERE c.id IN (${Prisma.join(ids.length ? ids : [""])})` : Prisma.empty;
  const rows = await tx.$queryRaw<{ id: string; owed: bigint; last_paid: Date | null }[]>`
    SELECT c.id,
           coalesce(s.on_account, 0) - coalesce(r.taken_off, 0) - coalesce(p.paid, 0) AS owed,
           p.last_paid
    FROM "CreditCustomer" c
    LEFT JOIN (
      SELECT s."creditCustomerId" AS id, sum(pp."amountMinor") AS on_account
      FROM "PosPayment" pp JOIN "PosSale" s ON s.id = pp."saleId"
      WHERE pp.method = 'CREDIT' AND s.status = 'COMPLETED' AND s."creditCustomerId" IS NOT NULL
      GROUP BY 1
    ) s ON s.id = c.id
    LEFT JOIN (
      SELECT s."creditCustomerId" AS id, sum(ret."refundMinor") AS taken_off
      FROM "PosReturn" ret JOIN "PosSale" s ON s.id = ret."saleId"
      WHERE ret.method = 'CREDIT' AND s."creditCustomerId" IS NOT NULL
      GROUP BY 1
    ) r ON r.id = c.id
    LEFT JOIN (
      SELECT "customerId" AS id, sum("amountMinor") AS paid, max("receivedAt") AS last_paid
      FROM "CreditPayment" GROUP BY 1
    ) p ON p.id = c.id
    ${only}
  `;
  return new Map(rows.map((row) => [row.id, { owedMinor: Number(row.owed), lastPaidAt: row.last_paid }]));
}

const customerSelect = { id: true, name: true, phone: true, limitMinor: true, notes: true, isActive: true, createdAt: true } satisfies Prisma.CreditCustomerSelect;
type CustomerRow = Prisma.CreditCustomerGetPayload<{ select: typeof customerSelect }>;

export interface CreditCustomerSummary extends CustomerRow {
  owedMinor: number;
  lastPaidAt: Date | null;
}

function withBalance(row: CustomerRow, all: Map<string, Balance>): CreditCustomerSummary {
  const balance = all.get(row.id);
  return { ...row, owedMinor: balance?.owedMinor ?? 0, lastPaidAt: balance?.lastPaidAt ?? null };
}

/** Customers matching a name or number, those who owe most first. */
export async function listCreditCustomers(search = ""): Promise<CreditCustomerSummary[]> {
  const term = search.trim();
  const digits = term.replace(/\D/g, "");
  const rows = await prisma.creditCustomer.findMany({
    where: term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^233/, "") } }] : [])] }
      : undefined,
    select: customerSelect,
    orderBy: { name: "asc" },
    take: 500,
  });
  const all = await balances(prisma, rows.map((row) => row.id));
  return rows.map((row) => withBalance(row, all)).toSorted((a, b) => b.owedMinor - a.owedMinor || a.name.localeCompare(b.name));
}

/** Everything owed to the shop on credit, and by how many customers. */
export async function creditTotals(): Promise<{ owedMinor: number; customersOwing: number }> {
  const all = [...(await balances(prisma)).values()].filter((balance) => balance.owedMinor > 0);
  return { owedMinor: all.reduce((sum, balance) => sum + balance.owedMinor, 0), customersOwing: all.length };
}

/** Every customer as the till keeps them, so it can sell on account offline. */
export async function tillCreditCustomers(): Promise<TillCreditCustomer[]> {
  const rows = await prisma.creditCustomer.findMany({ select: customerSelect, orderBy: { name: "asc" }, take: 2000 });
  const all = await balances(prisma);
  return rows.map((row) => {
    const { id, name, phone, limitMinor, isActive, owedMinor } = withBalance(row, all);
    return { id, name, phone, limitMinor, isActive, balanceMinor: owedMinor };
  });
}

export interface CreditCustomerDetail extends CreditCustomerSummary {
  addedByName: string | null;
  statement: ReturnType<typeof withRunningBalance>;
}

/** A customer with their statement: every sale on account, goods brought back onto it, and payment. */
export async function creditCustomerDetail(id: string): Promise<CreditCustomerDetail | null> {
  const row = await prisma.creditCustomer.findUnique({ where: { id }, select: { ...customerSelect, addedBy: { select: { name: true } } } });
  if (!row) return null;
  const [sales, returns, payments, all] = await Promise.all([
    prisma.posSale.findMany({
      where: { creditCustomerId: id, status: "COMPLETED" },
      select: { id: true, receiptNumber: true, soldAt: true, totalMinor: true, payments: { where: { method: "CREDIT" }, select: { amountMinor: true } }, cashier: { select: { name: true } } },
    }),
    prisma.posReturn.findMany({
      where: { method: "CREDIT", sale: { creditCustomerId: id } },
      select: { id: true, number: true, createdAt: true, refundMinor: true, sale: { select: { receiptNumber: true } } },
    }),
    prisma.creditPayment.findMany({
      where: { customerId: id },
      select: { id: true, receivedAt: true, amountMinor: true, method: true, reference: true, note: true, shiftId: true, takenBy: { select: { name: true } } },
    }),
    balances(prisma, [id]),
  ]);
  const entries: StatementEntry[] = [
    ...sales.map((sale) => ({
      id: sale.id,
      kind: "sale" as const,
      at: sale.soldAt.toISOString(),
      amountMinor: sale.payments.reduce((sum, p) => sum + p.amountMinor, 0),
      label: `Bought on account, receipt ${sale.receiptNumber}`,
      detail: `Sale of ${formatMoney(sale.totalMinor)} at the till by ${sale.cashier.name}`,
    })),
    ...returns.map((ret) => ({
      id: ret.id,
      kind: "return" as const,
      at: ret.createdAt.toISOString(),
      amountMinor: -ret.refundMinor,
      label: `Goods brought back, refund ${formatRefundNumber(ret.number)}`,
      detail: `From receipt ${ret.sale.receiptNumber}`,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      kind: "payment" as const,
      at: payment.receivedAt.toISOString(),
      amountMinor: -payment.amountMinor,
      label: `Paid by ${POS_TENDER_LABELS[payment.method as PosTenderCode].toLowerCase()}`,
      detail: [payment.shiftId ? `At the till, taken by ${payment.takenBy.name}` : `Recorded by ${payment.takenBy.name}`, payment.reference ? `ref ${payment.reference}` : null, payment.note]
        .filter(Boolean)
        .join(" · "),
    })),
  ];
  const { addedBy, ...customer } = row;
  return { ...withBalance(customer, all), addedByName: addedBy?.name ?? null, statement: withRunningBalance(entries) };
}

export type CreditCustomerOutcome = { ok: true; customer: CustomerRow } | { ok: false; error: string; field?: "name" | "phone" | "limitMinor" | "notes" };

async function phoneTakenBy(phone: string, exceptId?: string): Promise<string | null> {
  const other = await prisma.creditCustomer.findUnique({ where: { phone }, select: { id: true, name: true } });
  return other && other.id !== exceptId ? other.name : null;
}

/** Adds a credit customer. Cashiers add them at the till; managers in the admin, with a limit if they like. */
export async function addCreditCustomer(input: unknown, actorId: string): Promise<CreditCustomerOutcome> {
  const parsed = creditCustomerSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the customer's details.", field: issue?.path[0] as "name" | "phone" | undefined };
  }
  const existing = await phoneTakenBy(parsed.data.phone);
  if (existing) return { ok: false, error: `${existing} already has an account with this number.`, field: "phone" };
  try {
    const customer = await prisma.creditCustomer.create({
      data: { name: parsed.data.name, phone: parsed.data.phone, limitMinor: parsed.data.limitMinor, notes: parsed.data.notes || null, addedById: actorId },
      select: customerSelect,
    });
    await recordAudit({ actorId, action: "credit.customer.add", entityType: "CreditCustomer", entityId: customer.id, details: { name: customer.name, limitMinor: customer.limitMinor } });
    return { ok: true, customer };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "Someone already has an account with this number.", field: "phone" };
    throw error;
  }
}

/** Changes a customer's details, limit, or whether they may still buy on credit. */
export async function updateCreditCustomer(id: string, input: unknown, isActive: boolean, actorId: string): Promise<CreditCustomerOutcome> {
  const parsed = creditCustomerSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the customer's details.", field: issue?.path[0] as "name" | "phone" | undefined };
  }
  const existing = await phoneTakenBy(parsed.data.phone, id);
  if (existing) return { ok: false, error: `${existing} already has an account with this number.`, field: "phone" };
  const customer = await prisma.creditCustomer.update({
    where: { id },
    data: { name: parsed.data.name, phone: parsed.data.phone, limitMinor: parsed.data.limitMinor, notes: parsed.data.notes || null, isActive },
    select: customerSelect,
  });
  await recordAudit({ actorId, action: "credit.customer.update", entityType: "CreditCustomer", entityId: id, details: { limitMinor: customer.limitMinor, isActive } });
  return { ok: true, customer };
}

class PaymentRefused extends Error {}

async function paymentView(id: string): Promise<RecordedCreditPayment> {
  const payment = await prisma.creditPayment.findUniqueOrThrow({
    where: { id },
    select: { id: true, clientId: true, amountMinor: true, method: true, reference: true, receivedAt: true, customer: { select: { id: true, name: true, phone: true } }, takenBy: { select: { name: true } } },
  });
  const owed = (await balances(prisma, [payment.customer.id])).get(payment.customer.id)?.owedMinor ?? 0;
  return {
    id: payment.id,
    clientId: payment.clientId,
    customerId: payment.customer.id,
    customerName: payment.customer.name,
    customerPhone: payment.customer.phone,
    amountMinor: payment.amountMinor,
    method: payment.method as PosTenderCode,
    reference: payment.reference,
    receivedAt: payment.receivedAt.toISOString(),
    takenByName: payment.takenBy.name,
    owedAfterMinor: owed,
  };
}

/**
 * Records money a customer paid off their account. At the till it goes into
 * the open shift's drawer (shiftClientId); in the admin it belongs to no
 * shift. Never more than they owe. Sending the same payment again records it once.
 */
export async function recordCreditPayment(input: CreditPaymentInput, takenById: string, shiftClientId: string | null = null): Promise<CreditPaymentResult> {
  const existing = await prisma.creditPayment.findUnique({ where: { clientId: input.clientId }, select: { id: true } });
  if (existing) return { status: "duplicate", payment: await paymentView(existing.id) };
  try {
    const id = await prisma.$transaction(async (tx) => {
      // Locked so two payments at once cannot both pay off the same debt.
      const [customer] = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM "CreditCustomer" WHERE id = ${input.customerId} FOR UPDATE`;
      if (!customer) throw new PaymentRefused("This credit customer was not found.");
      let shiftId: string | null = null;
      if (shiftClientId) {
        const shift = await tx.posShift.findUnique({ where: { clientId: shiftClientId }, select: { id: true, cashierId: true, closedAt: true } });
        if (!shift || shift.closedAt) throw new PaymentRefused("Payments at the till go into the open shift. Open a shift first.");
        if (shift.cashierId !== takenById) throw new PaymentRefused("The shift open on this till belongs to another cashier.");
        shiftId = shift.id;
      }
      const owed = (await balances(tx, [customer.id])).get(customer.id)?.owedMinor ?? 0;
      if (owed <= 0) throw new PaymentRefused(`${customer.name} does not owe anything.`);
      if (input.amountMinor > owed) throw new PaymentRefused(`${customer.name} owes ${formatMoney(owed)}. Take that amount or less.`);
      const payment = await tx.creditPayment.create({
        data: {
          clientId: input.clientId,
          customerId: customer.id,
          amountMinor: input.amountMinor,
          method: input.method,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          takenById,
          shiftId,
        },
        select: { id: true },
      });
      await recordAudit(
        { actorId: takenById, action: "credit.payment", entityType: "CreditCustomer", entityId: customer.id, details: { amountMinor: input.amountMinor, method: input.method, atTill: shiftId !== null } },
        tx,
      );
      return payment.id;
    });
    return { status: "recorded", payment: await paymentView(id) };
  } catch (error) {
    if (error instanceof PaymentRefused) return { status: "rejected", error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const recorded = await prisma.creditPayment.findUnique({ where: { clientId: input.clientId }, select: { id: true } });
      if (recorded) return { status: "duplicate", payment: await paymentView(recorded.id) };
    }
    throw error;
  }
}

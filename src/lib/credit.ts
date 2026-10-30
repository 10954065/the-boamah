import { z } from "zod";
import { formatMoney } from "@/lib/money";
import { POS_TENDERS, type PosTenderCode } from "@/lib/pos";
import { ghanaPhone } from "@/lib/validation";

/**
 * Customers the shop lets buy on credit ("on account") at the till. What a
 * customer owes is never stored: it is always worked out from their credit
 * sales, the goods they brought back, and the payments they made.
 */

const MAX_AMOUNT_MINOR = 100_000_000; // GH₵1,000,000

/** A Ghana number in one form, 0XXXXXXXXX, so the same customer cannot be added twice. */
export const creditPhone = ghanaPhone.transform((value) => (value.startsWith("+233") ? `0${value.slice(4)}` : value));

export const creditCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(80, "Keep the name under 80 characters."),
  phone: creditPhone,
  /** The most they may owe; null means no limit. */
  limitMinor: z.number().int().min(0, "The limit cannot be below zero.").max(MAX_AMOUNT_MINOR).nullable().default(null),
  notes: z.string().trim().max(300, "Keep the notes under 300 characters.").optional(),
});

export type CreditCustomerInput = z.input<typeof creditCustomerSchema>;

/** Money a credit customer paid towards what they owe. The clientId makes a retried request count once. */
export const creditPaymentSchema = z
  .object({
    clientId: z.uuid(),
    customerId: z.string().min(1).max(64),
    amountMinor: z.number().int().positive("Enter the amount paid.").max(MAX_AMOUNT_MINOR),
    method: z.enum(POS_TENDERS),
    reference: z.string().trim().max(60).nullish(),
    note: z.string().trim().max(300).nullish(),
  })
  .refine((payment) => payment.method !== "MOMO" || Boolean(payment.reference?.trim()), {
    path: ["reference"],
    message: "Enter the mobile money transaction ID.",
  });

export type CreditPaymentInput = z.input<typeof creditPaymentSchema>;

/** A payment taken at the till goes into the shift open there. */
export const tillCreditPaymentSchema = z.object({ payment: creditPaymentSchema, shiftClientId: z.uuid() });

export type TillCreditPaymentInput = z.input<typeof tillCreditPaymentSchema>;

interface CreditStanding {
  isActive: boolean;
  balanceMinor: number;
  limitMinor: number | null;
}

/** Why this amount cannot go on the customer's account, or null when it can. */
export function creditProblem(customer: CreditStanding, amountMinor: number): string | null {
  if (!customer.isActive) return "This customer cannot buy on credit any more.";
  if (customer.limitMinor === null) return null;
  const room = Math.max(customer.limitMinor - customer.balanceMinor, 0);
  return amountMinor > room ? `This goes over their credit limit. They can take ${formatMoney(room)} more on account.` : null;
}

/** A credit customer as the till keeps them, so it can sell on account while offline. */
export interface TillCreditCustomer {
  id: string;
  name: string;
  phone: string;
  balanceMinor: number;
  limitMinor: number | null;
  isActive: boolean;
}

/** The customer list as the till stores it on the device. */
export const storedCreditListSchema = z.object({
  loadedAt: z.string(),
  customers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      balanceMinor: z.number().int(),
      limitMinor: z.number().int().nullable(),
      isActive: z.boolean(),
    }),
  ),
});

interface UnsentSale {
  upload: { creditCustomerId?: string | null; payments: readonly { method: string; amountMinor: number }[] };
}

/** What sales still waiting on the till put on each customer's account; the list from the server does not know them yet. */
export function unsentCredit(sales: readonly UnsentSale[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const { upload } of sales) {
    if (!upload.creditCustomerId) continue;
    const onAccount = upload.payments.filter((p) => p.method === "CREDIT").reduce((sum, p) => sum + p.amountMinor, 0);
    owed.set(upload.creditCustomerId, (owed.get(upload.creditCustomerId) ?? 0) + onAccount);
  }
  return owed;
}

/** A payment as recorded, with what the customer owes after it, for the till's payment slip. */
export interface RecordedCreditPayment {
  id: string;
  clientId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  amountMinor: number;
  method: PosTenderCode;
  reference: string | null;
  receivedAt: string;
  takenByName: string;
  owedAfterMinor: number;
}

export type CreditPaymentResult = { status: "recorded" | "duplicate"; payment: RecordedCreditPayment } | { status: "rejected"; error: string };

/** What the till gets back when it adds a customer. */
export type AddCreditCustomerResult = { status: "added"; customer: TillCreditCustomer } | { status: "rejected"; error: string; field: string | null };

export type StatementKind = "sale" | "return" | "payment";

/** One line of a customer's statement. Sales add to what is owed; returns and payments take it down. */
export interface StatementEntry {
  id: string;
  kind: StatementKind;
  at: string;
  /** Positive adds to what is owed, negative takes it down. */
  amountMinor: number;
  label: string;
  detail?: string;
}

/** Statement lines oldest first, each with what was owed after it. */
export function withRunningBalance(entries: readonly StatementEntry[]): (StatementEntry & { balanceAfterMinor: number })[] {
  let balance = 0;
  return entries
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((entry) => {
      balance += entry.amountMinor;
      return { ...entry, balanceAfterMinor: balance };
    });
}

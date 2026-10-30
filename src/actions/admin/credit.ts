"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { creditPaymentSchema, type CreditCustomerInput, type CreditPaymentInput } from "@/lib/credit";
import { addCreditCustomer, recordCreditPayment, updateCreditCustomer, type CreditCustomerOutcome } from "@/server/credit";
import { authorize, runAction } from "@/server/session";

function asResult(outcome: CreditCustomerOutcome, message: string): ActionResult<{ id: string }> {
  if (!outcome.ok) return fail(outcome.error, outcome.field ? { [outcome.field]: outcome.error } : undefined);
  revalidatePath("/admin/credit");
  revalidatePath(`/admin/credit/${outcome.customer.id}`);
  return ok({ id: outcome.customer.id }, message);
}

export async function addCreditCustomerAction(input: CreditCustomerInput): Promise<ActionResult<{ id: string }>> {
  return runAction("admin.credit.add", async () => {
    const user = await authorize("credit:manage");
    return asResult(await addCreditCustomer(input, user.id), "Credit customer added.");
  });
}

const idSchema = z.string().min(1).max(64);

export async function updateCreditCustomerAction(id: string, input: CreditCustomerInput, isActive: boolean): Promise<ActionResult<{ id: string }>> {
  return runAction("admin.credit.update", async () => {
    const user = await authorize("credit:manage");
    if (!idSchema.safeParse(id).success || typeof isActive !== "boolean") return fail("This customer could not be found.");
    return asResult(await updateCreditCustomer(id, input, isActive, user.id), "Customer saved.");
  });
}

/** A payment taken outside the till, e.g. mobile money sent straight to the shop. It belongs to no shift. */
export async function recordCreditPaymentAction(input: CreditPaymentInput): Promise<ActionResult<{ owedAfterMinor: number }>> {
  return runAction("admin.credit.payment", async () => {
    const user = await authorize("credit:manage");
    const parsed = creditPaymentSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const result = await recordCreditPayment(parsed.data, user.id);
    if (result.status === "rejected") return fail(result.error, { amountMinor: result.error });
    revalidatePath("/admin/credit");
    revalidatePath(`/admin/credit/${parsed.data.customerId}`);
    return ok({ owedAfterMinor: result.payment.owedAfterMinor }, "Payment recorded.");
  });
}

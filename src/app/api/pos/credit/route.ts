import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addCreditCustomer, tillCreditCustomers } from "@/server/credit";
import { tillError, tillJson, tillRequestUser } from "@/server/pos/request";

/** Credit customers and what each owes, which the till keeps so it can sell on account offline. */
export async function GET(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: false });
  if (user instanceof NextResponse) return user;
  return tillJson({ customers: await tillCreditCustomers() });
}

const newCustomerSchema = z.object({ name: z.string().max(200), phone: z.string().max(40) });

/** Adds a credit customer at the till: their name and phone number. Managers set limits in the admin. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;
  const body = newCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return tillError("Enter the customer's name and phone number.", 400);

  const outcome = await addCreditCustomer({ name: body.data.name, phone: body.data.phone }, user.id);
  if (!outcome.ok) return tillJson({ status: "rejected", error: outcome.error, field: outcome.field ?? null });
  const { id, name, phone, limitMinor, isActive } = outcome.customer;
  return tillJson({ status: "added", customer: { id, name, phone, limitMinor, isActive, balanceMinor: 0 } });
}

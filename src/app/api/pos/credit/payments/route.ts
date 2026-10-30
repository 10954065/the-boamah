import { NextResponse, type NextRequest } from "next/server";
import { tillCreditPaymentSchema } from "@/lib/credit";
import { recordCreditPayment } from "@/server/credit";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";

/**
 * Money a credit customer pays off their account at the till. It goes into
 * the open shift's drawer, so it is counted at close. Online only; sending
 * the same payment again records it once.
 */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;
  const body = await tillBody(request, tillCreditPaymentSchema);
  if (!body) return tillError("The payment is not in the expected format.", 400);
  try {
    return tillJson(await recordCreditPayment(body.payment, user.id, body.shiftClientId));
  } catch (error) {
    console.error("[api/pos/credit/payments]", error);
    return tillError("The payment could not be saved. Try again.", 500);
  }
}

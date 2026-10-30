import { NextResponse, type NextRequest } from "next/server";
import { posVoidSchema } from "@/lib/pos-returns";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";
import { voidPosSale } from "@/server/pos/voids";

/** Voids a sale of the shift open on the till, with a manager's approval. Needs the internet. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const input = await tillBody(request, posVoidSchema);
  if (!input) return tillError("The void is not in the expected format.", 400);

  try {
    return tillJson(await voidPosSale(input, user));
  } catch (error) {
    console.error("[api/pos/voids]", error);
    return tillError("The sale could not be voided. Try again.", 500);
  }
}

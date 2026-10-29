import { NextResponse, type NextRequest } from "next/server";
import { posSyncSchema } from "@/lib/pos";
import { noStore, tillBody, tillError, tillRequestUser } from "@/server/pos/request";
import { recordPosSales } from "@/server/pos/sales";

/**
 * Uploads sales made at the till (possibly while offline). Each sale is
 * recorded once however often it is sent; the response says per sale whether
 * it was recorded, already there, or refused and why.
 */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const upload = await tillBody(request, posSyncSchema);
  if (!upload) return tillError("The sales upload is not in the expected format.", 400);

  try {
    const results = await recordPosSales(upload.sales, user);
    return NextResponse.json({ results }, { headers: noStore });
  } catch (error) {
    console.error("[api/pos/sales]", error);
    return tillError("The sales could not be saved. They stay on the till and will be sent again.", 500);
  }
}

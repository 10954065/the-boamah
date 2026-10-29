import { NextResponse, type NextRequest } from "next/server";
import { loadPosCatalog } from "@/server/pos/catalog";
import { noStore, tillError, tillRequestUser } from "@/server/pos/request";

/** The products the till sells, with live prices and stock. */
export async function GET(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: false });
  if (user instanceof NextResponse) return user;
  try {
    const items = await loadPosCatalog();
    return NextResponse.json({ items, loadedAt: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    console.error("[api/pos/catalog]", error);
    return tillError("The products could not be loaded.", 500);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { posSyncSchema } from "@/lib/pos";
import { recordPosSales } from "@/server/pos/sales";
import { getCurrentUser } from "@/server/session";

const noStore = { "Cache-Control": "no-store" };

/** The page must be the shop's own: a form on another site cannot post sales with a staff cookie. */
function fromOwnPage(request: NextRequest): boolean {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Uploads sales made at the till (possibly while offline). Each sale is
 * recorded once however often it is sent; the response says per sale whether
 * it was recorded, already there, or refused and why.
 */
export async function POST(request: NextRequest) {
  if (!fromOwnPage(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  if (!hasPermission(user.role, "pos:sell")) return NextResponse.json({ error: "This account cannot use the till." }, { status: 403, headers: noStore });

  const body: unknown = await request.json().catch(() => null);
  const parsed = posSyncSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "The sales upload is not in the expected format." }, { status: 400, headers: noStore });

  try {
    const results = await recordPosSales(parsed.data.sales);
    return NextResponse.json({ results }, { headers: noStore });
  } catch (error) {
    console.error("[api/pos/sales]", error);
    return NextResponse.json({ error: "The sales could not be saved. They stay on the till and will be sent again." }, { status: 500, headers: noStore });
  }
}

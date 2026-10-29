import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser, type CurrentUser } from "@/server/session";

export const noStore = { "Cache-Control": "no-store" };

/** Well above the largest valid upload (50 sales of 200 lines). */
const MAX_BODY_BYTES = 2_000_000;

/** The page must be the shop's own: a form on another site cannot post to the till with a staff cookie. */
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

export function tillError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

/**
 * The signed-in till user for an API request, or the response to send
 * instead. Requests that change anything must also come from the till's own page.
 */
export async function tillRequestUser(request: NextRequest, { changes }: { changes: boolean }): Promise<CurrentUser | NextResponse> {
  if (changes && !fromOwnPage(request)) return tillError("Forbidden", 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tillError("The upload is too large.", 413);
  const user = await getCurrentUser();
  if (!user) return tillError("Please sign in again.", 401);
  if (!hasPermission(user.role, "pos:sell")) return tillError("This account cannot use the till.", 403);
  return user;
}

/** Parses the JSON body with a schema; null when it does not match. */
export async function tillBody<T>(request: NextRequest, schema: { safeParse(data: unknown): { success: true; data: T } | { success: false } }): Promise<T | null> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

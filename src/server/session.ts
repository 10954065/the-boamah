import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ActionError, fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { hasPermission, isRole, isStaffRole, type Permission, type RoleCode } from "@/lib/permissions";
import { auth } from "@/server/auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleCode;
  isStaff: boolean;
}

/**
 * The signed-in user for this request. Role and status are re-read from the
 * database so a role change or suspension takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE" || !isRole(user.role)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isStaff: isStaffRole(user.role),
  };
});

/** For pages: redirects to login when signed out. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** For admin pages: customers are sent to login; staff without the permission see a no-access page. */
export async function requireStaffPage(permission: Permission, returnTo = "/admin"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!user.isStaff) redirect("/");
  if (!hasPermission(user.role, permission)) redirect("/admin/no-access");
  return user;
}

/** For server actions: throws ActionError when not authorised. */
export async function authorize(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Please sign in again.", "UNAUTHENTICATED");
  if (!hasPermission(user.role, permission)) {
    throw new ActionError("You do not have permission to perform this action.", "FORBIDDEN");
  }
  return user;
}

export async function authorizeCustomer(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Please sign in to continue.", "UNAUTHENTICATED");
  return user;
}

/**
 * Wraps a server action body: converts ActionErrors to failed results and
 * hides unexpected internals from the client while logging them server-side.
 */
export async function runAction<T>(label: string, body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof ActionError) return fail(error.message);
    // Re-throw Next.js control-flow errors (redirect / notFound).
    if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_")) {
      throw error;
    }
    console.error(`[action:${label}]`, error);
    return fail("Something went wrong. Please try again.");
  }
}

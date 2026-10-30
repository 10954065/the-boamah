import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { ActionError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { isStaffRole, type RoleCode } from "@/lib/permissions";
import { posOrigin } from "@/lib/pos-host";
import { entrySlug, gateKey } from "@/lib/staff-gate";
import { siteUrl } from "@/lib/utils";
import { recordAudit } from "@/server/audit";
import { clearSignInFailures } from "@/server/sign-in-limits";

/** Letters and digits that cannot be mistaken for each other when read out. */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMPORARY_PASSWORD_LENGTH = 16;
const CREDENTIAL_PROVIDER = "credential";

export function temporaryPassword(): string {
  return Array.from({ length: TEMPORARY_PASSWORD_LENGTH }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

export interface StaffLinks {
  admin: string;
  till: string;
}

/** The private links for the admin and the till, or null until STAFF_GATE_KEY is set. */
export function staffLinks(): StaffLinks | null {
  const key = gateKey();
  if (!key) return null;
  return {
    admin: siteUrl(`/${entrySlug(key, "admin")}`),
    till: `${posOrigin() || siteUrl()}/${entrySlug(key, "till")}`,
  };
}

function isDuplicateEmail(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function staffMember(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, status: true } });
  if (!user || !isStaffRole(user.role)) throw new ActionError("Staff member not found.", "NOT_FOUND");
  return user;
}

/** Creates a staff account with a temporary password, returned once and never stored. */
export async function addStaffMember(actorId: string, input: { name: string; email: string; role: RoleCode }): Promise<{ userId: string; temporaryPassword: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  if (existing) {
    throw new ActionError(
      isStaffRole(existing.role) ? "That email already belongs to a staff member." : "That email has an old shop account. Give it a role below, then reset its password.",
      "CONFLICT",
    );
  }
  const userId = randomBytes(16).toString("hex");
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email, name: input.name, role: input.role, emailVerified: true } });
      await tx.account.create({ data: { id: randomBytes(16).toString("hex"), accountId: userId, providerId: CREDENTIAL_PROVIDER, userId, password: hash } });
      await recordAudit({ actorId, action: "staff.create", entityType: "User", entityId: userId, details: { role: input.role } }, tx);
    });
  } catch (error) {
    if (isDuplicateEmail(error)) throw new ActionError("That email already belongs to a staff member.", "CONFLICT");
    throw error;
  }
  return { userId, temporaryPassword: password };
}

/** Sets a new temporary password, signs the person out everywhere and lifts any sign-in pause. */
export async function resetStaffMemberPassword(actorId: string, userId: string): Promise<{ name: string; temporaryPassword: string }> {
  if (userId === actorId) throw new ActionError("Change your own password under My account.", "FORBIDDEN");
  const user = await staffMember(userId);
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({ where: { userId, providerId: CREDENTIAL_PROVIDER }, data: { password: hash } });
    if (updated.count === 0) {
      await tx.account.create({ data: { id: randomBytes(16).toString("hex"), accountId: userId, providerId: CREDENTIAL_PROVIDER, userId, password: hash } });
    }
    await tx.session.deleteMany({ where: { userId } });
    await recordAudit({ actorId, action: "staff.password_reset", entityType: "User", entityId: userId }, tx);
  });
  await clearSignInFailures(user.email);
  return { name: user.name, temporaryPassword: password };
}

/** Suspending takes effect immediately: existing sessions are revoked. */
export async function setStaffMemberSuspended(actorId: string, userId: string, suspended: boolean): Promise<void> {
  if (userId === actorId) throw new ActionError("You cannot suspend your own account.", "FORBIDDEN");
  const user = await staffMember(userId);
  if (suspended && user.role === "SUPER_ADMIN") {
    const others = await prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE", id: { not: userId } } });
    if (others === 0) throw new ActionError("At least one active Super Admin must remain.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: suspended ? "SUSPENDED" : "ACTIVE" } });
    if (suspended) await tx.session.deleteMany({ where: { userId } });
    await recordAudit({ actorId, action: suspended ? "user.suspend" : "user.reactivate", entityType: "User", entityId: userId }, tx);
  });
}

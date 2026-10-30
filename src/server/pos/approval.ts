import "server-only";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { hasPermission, isRole } from "@/lib/permissions";
import type { ManagerApproval } from "@/lib/pos-returns";
import { recordAudit } from "@/server/audit";
import { failuresExceeded, noteFailure, type FailureCount, type FailureLimit } from "@/server/rate-limit";
import { PosRejected, type TillUser } from "./common";

/**
 * Wrong manager details allowed before approvals stop for a while: per
 * cashier and per manager email, and per manager email in a day. Approvals
 * that go through never count, so a busy day cannot lock a manager out.
 */
const FAILURE_LIMITS = {
  user: { name: "pos-approval-failed", max: 5, windowSeconds: 15 * 60 },
  email: { name: "pos-approval-failed-email", max: 5, windowSeconds: 15 * 60 },
  emailDay: { name: "pos-approval-failed-email-day", max: 20, windowSeconds: 24 * 60 * 60 },
} satisfies Record<string, FailureLimit>;

const failureCounts = (userId: string, email: string): FailureCount[] => [
  { limit: FAILURE_LIMITS.user, identifier: userId },
  { limit: FAILURE_LIMITS.email, identifier: email },
  { limit: FAILURE_LIMITS.emailDay, identifier: email },
];

export interface Approver {
  id: string;
  name: string;
}

let dummyHash: Promise<string> | null = null;

/** Checked when no such manager exists, so a wrong email takes as long as a wrong password. */
function noAccountHash(): Promise<string> {
  dummyHash ??= hashPassword("no account has this password");
  return dummyHash;
}

async function recordWrongApproval(user: TillUser, email: string): Promise<void> {
  await noteFailure(failureCounts(user.id, email));
  await recordAudit({ actorId: user.id, action: "pos.approval.failed", entityType: "User", details: { managerEmail: email } });
}

/**
 * Who approves a void, return or removal at the till: the signed-in user
 * when they are a manager, otherwise a manager who types their own email and
 * password on the till. The details are checked here and never kept.
 */
export async function approvingManager(user: TillUser, approval: ManagerApproval | null | undefined): Promise<Approver> {
  if (hasPermission(user.role, "pos:manage")) return { id: user.id, name: user.name };
  if (!approval) throw new PosRejected("A manager needs to approve this.");

  const email = approval.email.trim().toLowerCase();
  if (await failuresExceeded(failureCounts(user.id, email))) throw new PosRejected("Too many wrong manager details. Wait 15 minutes and try again, or ask the manager to sign in on the till.");

  const manager = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, status: true, accounts: { where: { providerId: "credential" }, select: { password: true }, take: 1 } },
  });
  const hash = manager?.accounts[0]?.password ?? null;
  const passwordOk = await verifyPassword({ hash: hash ?? (await noAccountHash()), password: approval.password });
  const isManager = manager !== null && manager.status === "ACTIVE" && isRole(manager.role) && hasPermission(manager.role, "pos:manage");
  if (!hash || !passwordOk || !isManager) {
    await recordWrongApproval(user, email);
    throw new PosRejected("Those manager details are not right, or that account cannot approve this.");
  }
  return { id: manager.id, name: manager.name };
}

import "server-only";
import { recordAudit } from "@/server/audit";
import { clearFailures, failuresExceeded, noteFailure, type FailureCount, type FailureLimit } from "@/server/rate-limit";

/**
 * Wrong passwords allowed per account before its sign-in stops for a while,
 * on top of Better Auth's per-address limit (src/server/auth.ts), so moving
 * between addresses does not buy more guesses. Sign-ins that work never count.
 */
const SIGN_IN_LIMITS = {
  email: { name: "sign-in-failed-email", max: 5, windowSeconds: 15 * 60 },
  emailDay: { name: "sign-in-failed-email-day", max: 20, windowSeconds: 24 * 60 * 60 },
} satisfies Record<string, FailureLimit>;

export const SIGN_IN_LOCKED_MESSAGE = "Too many wrong passwords for this account. Try again later, or use Forgot your password to choose a new one.";

function counts(email: string): FailureCount[] {
  const identifier = email.trim().toLowerCase();
  return [
    { limit: SIGN_IN_LIMITS.email, identifier },
    { limit: SIGN_IN_LIMITS.emailDay, identifier },
  ];
}

/** Whether this account's sign-in is paused after too many wrong passwords. */
export function signInLocked(email: string, now = Date.now()): Promise<boolean> {
  return failuresExceeded(counts(email), now);
}

/** Lifts a pause, for when the account's password is reset. */
export function clearSignInFailures(email: string): Promise<void> {
  return clearFailures(counts(email));
}

/** Counts a wrong password; the try that pauses the account is written to the audit log. */
export async function noteSignInFailure(email: string, ip: string): Promise<void> {
  if (await noteFailure(counts(email))) {
    await recordAudit({ actorId: null, action: "auth.sign_in.locked", entityType: "User", details: { email: email.trim().toLowerCase(), ip } });
  }
}

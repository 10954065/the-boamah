import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

// Crockford-style alphabet without easily confused characters (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Human-friendly unique order reference, e.g. BMH-261025-7KQ4XM. */
export function generateOrderReference(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `BMH-${yy}${mm}${dd}-${suffix}`;
}

export function generatePaymentReference(orderReference: string): string {
  return `${orderReference}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Random token that lets a guest view their order; only its hash is stored. */
export function generateGuestToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashGuestToken(token) };
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

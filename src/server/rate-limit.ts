import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Fixed-window rate limiter persisted in PostgreSQL so it works across
 * serverless instances. Returns true when the request is allowed.
 */
export async function rateLimit(name: string, identifier: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `app:${name}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${BigInt(now)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit"."lastRequest" < ${BigInt(windowStart)} THEN 1 ELSE "rate_limit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rate_limit"."lastRequest" < ${BigInt(windowStart)} THEN ${BigInt(now)} ELSE "rate_limit"."lastRequest" END
    RETURNING "count"
  `;
  return (rows[0]?.count ?? 1) <= max;
}

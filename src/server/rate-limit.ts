import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";
import { prisma } from "@/lib/db";

/** Best-effort client IP from proxy headers (see src/lib/client-ip.ts). */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
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

/** A limit on mistakes (wrong passwords and the like); tries that succeed never count. */
export interface FailureLimit {
  name: string;
  max: number;
  windowSeconds: number;
}

export interface FailureCount {
  limit: FailureLimit;
  identifier: string;
}

/** The row rateLimit() keeps for a limit. */
const storedKey = ({ limit, identifier }: FailureCount) => `app:${limit.name}:${identifier}`;

/** Whether any of these limits is used up, without counting this try. */
export async function failuresExceeded(counts: readonly FailureCount[], now = Date.now()): Promise<boolean> {
  const rows = await prisma.rateLimit.findMany({
    where: { key: { in: counts.map(storedKey) } },
    select: { key: true, count: true, lastRequest: true },
  });
  return counts.some((count) => {
    const row = rows.find((r) => r.key === storedKey(count));
    // The stored time is when the counting window started.
    return row !== undefined && Number(row.lastRequest) >= now - count.limit.windowSeconds * 1000 && row.count >= count.limit.max;
  });
}

/** Counts one mistake against each limit. Returns true when that used one of them up. */
export async function noteFailure(counts: readonly FailureCount[]): Promise<boolean> {
  let exceeded = false;
  for (const { limit, identifier } of counts) {
    if (!(await rateLimit(limit.name, identifier, limit.max - 1, limit.windowSeconds))) exceeded = true;
  }
  return exceeded;
}

/** Forgets the mistakes counted against these limits. */
export async function clearFailures(counts: readonly FailureCount[]): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: { in: counts.map(storedKey) } } });
}

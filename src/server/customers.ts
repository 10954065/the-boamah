import "server-only";
import { prisma } from "@/lib/db";

/**
 * Shoppers have no accounts, so a customer is everyone who checked out with
 * the same phone number. Orders keep the details given at checkout.
 */
export interface CustomerRow {
  key: string;
  name: string;
  email: string | null;
  orders: number;
  paidTotalMinor: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
}

interface StoredRow extends Omit<CustomerRow, "paidTotalMinor"> {
  paidTotalMinor: bigint;
  total: number;
}

/** One form of a number: 0241234567 and +233241234567 are the same customer. */
export function customerKey(phone: string): string {
  return phone.replace(/[\s-]/g, "").replace(/^\+233/, "0");
}

/** Postgres cannot skip more rows than an int holds, whatever ?page= says. */
const MAX_OFFSET = 2_000_000_000;

/** What a key looks like in both forms orders can hold it. */
function storedPhones(key: string): string[] {
  return [key, `+233${key.slice(1)}`];
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Customers with their most recent order first, optionally searched by name, email or phone. */
export async function listCustomers(q: string, page: number, pageSize: number): Promise<{ rows: CustomerRow[]; total: number }> {
  const text = likePattern(q);
  const phone = likePattern(customerKey(q).replace(/^233/, "0"));
  const rows = await prisma.$queryRaw<StoredRow[]>`
    WITH customers AS (
      SELECT
        regexp_replace("phone", '^\\+233', '0') AS key,
        (array_agg("customerName" ORDER BY "createdAt" DESC))[1] AS name,
        (array_agg("email" ORDER BY "createdAt" DESC) FILTER (WHERE "email" IS NOT NULL))[1] AS email,
        count(*)::int AS orders,
        coalesce(sum("totalMinor") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::bigint AS "paidTotalMinor",
        min("createdAt") AS "firstOrderAt",
        max("createdAt") AS "lastOrderAt"
      FROM "Order"
      GROUP BY 1
    )
    SELECT *, count(*) OVER ()::int AS total
    FROM customers
    WHERE ${q}::text = '' OR name ILIKE ${text}::text OR email ILIKE ${text}::text OR key LIKE ${phone}::text
    ORDER BY "lastOrderAt" DESC
    LIMIT ${pageSize}::int OFFSET ${Math.min((page - 1) * pageSize, MAX_OFFSET)}::int
  `;
  return {
    rows: rows.map((row) => ({
      key: row.key,
      name: row.name,
      email: row.email,
      orders: row.orders,
      paidTotalMinor: Number(row.paidTotalMinor),
      firstOrderAt: row.firstOrderAt,
      lastOrderAt: row.lastOrderAt,
    })),
    total: rows[0]?.total ?? 0,
  };
}

/** How many customers have ordered. */
export async function countCustomers(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT count(DISTINCT regexp_replace("phone", '^\\+233', '0'))::int AS count FROM "Order"`;
  return rows[0]?.count ?? 0;
}

const ORDERS_SHOWN = 50;

/** One customer's details and recent orders, or null when nobody ordered with that number. */
export async function customerByKey(key: string) {
  const where = { phone: { in: storedPhones(key) } };
  const [orders, paid, all] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: ORDERS_SHOWN }),
    prisma.order.aggregate({ where: { ...where, paymentStatus: "PAID" }, _sum: { totalMinor: true } }),
    prisma.order.aggregate({ where, _count: true, _min: { createdAt: true } }),
  ]);
  const latest = orders[0];
  if (!latest) return null;
  const addressed = orders.find((order) => order.addressLine);
  return {
    name: latest.customerName,
    phone: key,
    email: orders.find((order) => order.email)?.email ?? null,
    firstOrderAt: all._min.createdAt ?? latest.createdAt,
    paidTotalMinor: paid._sum.totalMinor ?? 0,
    orderCount: all._count,
    lastAddress: addressed ? { addressLine: addressed.addressLine, area: addressed.area, city: addressed.city } : null,
    orders,
  };
}

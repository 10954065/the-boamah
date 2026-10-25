import type { Metadata } from "next";
import { OrdersTable } from "@/components/account/orders-table";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

const PAGE_SIZE = 20;

export default async function AccountOrdersPage({ searchParams }: PageProps<"/account/orders">) {
  const user = await requireUser("/account/orders");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">My orders</h1>
      <OrdersTable orders={orders} />
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/account/orders?page=${n}`} />
    </div>
  );
}

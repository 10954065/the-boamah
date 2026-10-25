import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/account/account-forms";
import { OrdersTable } from "@/components/account/orders-table";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const recent = await prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 });
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Hello, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your details, orders and saved addresses.</p>
      </div>
      <section aria-labelledby="recent-title" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 id="recent-title" className="text-lg font-extrabold">
            Recent orders
          </h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        <OrdersTable orders={recent} />
      </section>
      <section aria-labelledby="profile-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <h2 id="profile-title" className="mb-4 text-lg font-extrabold">
          Your details
        </h2>
        <ProfileForm name={user.name} phone={user.phone} email={user.email} />
      </section>
    </div>
  );
}

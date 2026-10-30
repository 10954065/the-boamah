import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminMobileNav, AdminSidebarNav, AdminWhere, type AdminNavItem } from "@/components/admin/admin-nav";
import { Initials } from "@/components/admin/ui";
import { SignOutButton } from "@/components/account/account-forms";
import { LogoMark } from "@/components/brand/logo";
import { Alert } from "@/components/ui/feedback";
import { hasPermission, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { requireStaffPage } from "@/server/session";
import { getStoreSettings } from "@/server/settings";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

const NAV: (AdminNavItem & { permission: Permission })[] = [
  { href: "/admin", label: "Dashboard", group: "Overview", permission: "dashboard:view" },
  { href: "/admin/orders", label: "Orders", group: "Sales", permission: "orders:view" },
  { href: "/admin/customers", label: "Customers", group: "Sales", permission: "customers:view" },
  { href: "/admin/credit", label: "Credit customers", group: "Sales", permission: "credit:manage" },
  { href: "/admin/till", label: "Till sales", group: "Shop till", permission: "pos:manage" },
  { href: "/admin/till/shifts", label: "Till shifts", group: "Shop till", permission: "pos:manage" },
  { href: "/admin/till/review", label: "Till review", group: "Shop till", permission: "pos:manage" },
  { href: "/admin/products", label: "Products", group: "Catalogue", permission: "catalog:view" },
  { href: "/admin/categories", label: "Categories", group: "Catalogue", permission: "catalog:view" },
  { href: "/admin/inventory", label: "Inventory", group: "Catalogue", permission: "inventory:adjust" },
  { href: "/admin/reviews", label: "Reviews", group: "Catalogue", permission: "reviews:manage" },
  { href: "/admin/coupons", label: "Coupons", group: "Marketing", permission: "promotions:manage" },
  { href: "/admin/banners", label: "Banners", group: "Marketing", permission: "promotions:manage" },
  { href: "/admin/delivery", label: "Delivery zones", group: "Store", permission: "delivery:manage" },
  { href: "/admin/settings", label: "Settings", group: "Store", permission: "settings:manage" },
  { href: "/admin/staff", label: "Staff & roles", group: "Store", permission: "staff:manage" },
  { href: "/admin/notifications", label: "Notifications", group: "Logs", permission: "notifications:view" },
  { href: "/admin/audit", label: "Audit log", group: "Logs", permission: "audit:view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage("dashboard:view");
  const settings = await getStoreSettings();
  const items = NAV.filter((item) => hasPermission(user.role, item.permission)).map(({ href, label, group }) => ({ href, label, group }));

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand-900 lg:flex print:hidden">
        <div className="px-5 pb-6 pt-6">
          <Link href="/admin" className="flex items-center gap-3">
            <LogoMark className="h-11 w-11 rounded-xl" />
            <span className="leading-tight">
              <span className="block font-display text-[17px] font-extrabold text-white">The Boamah&rsquo;s</span>
              <span className="block text-[12px] font-bold text-gold-300">Admin panel</span>
            </span>
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <AdminSidebarNav items={items} />
        </div>
        <Link href="/admin/account" className="m-3 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10 transition-colors hover:bg-white/10">
          <Initials name={user.name} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14px] font-bold text-white">{user.name}</span>
            <span className="block truncate text-[12px] font-semibold text-brand-200">{ROLE_LABELS[user.role]}</span>
          </span>
        </Link>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8 print:hidden">
          <AdminMobileNav items={items} />
          <AdminWhere items={items} />
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-ink-muted transition-colors hover:bg-soft hover:text-ink sm:flex">
              View store <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/admin/account" aria-label={`My account: ${user.name}, ${ROLE_LABELS[user.role]}`} className="flex items-center gap-2 rounded-full p-0.5 pr-3 transition-colors hover:bg-soft lg:hidden">
              <Initials name={user.name} small />
              <span className="hidden text-sm font-bold sm:inline">{user.name.split(" ")[0]}</span>
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main id="main" className="px-4 py-6 font-medium sm:px-6 lg:px-8 lg:py-8">
          {settings.isSampleData ? (
            <Alert tone="warning" title="This store contains sample data" className="mb-6">
              Products, prices, stock, delivery zones and policies were created for demonstration. Replace them with verified
              business information, then switch off &ldquo;sample data&rdquo; in Settings.
            </Alert>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

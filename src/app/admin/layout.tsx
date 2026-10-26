import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminMobileNav, AdminSidebarNav, type AdminNavItem } from "@/components/admin/admin-nav";
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
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-brand-900 px-3 py-5 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark className="h-9 w-9 ring-1 ring-brand-700" />
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-extrabold text-white">The Boamah&rsquo;s</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-leaf-400">Admin</span>
          </span>
        </Link>
        <AdminSidebarNav items={items} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <AdminMobileNav items={items} />
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{user.name}</span> · {ROLE_LABELS[user.role]}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:bg-soft hover:text-ink sm:flex">
              View store <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
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

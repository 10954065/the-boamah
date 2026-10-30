"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookUser,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingBag,
  Star,
  TicketPercent,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
  group: string;
}

/** Icons live here, on the client side, because the menu items come from the server as plain data. */
const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ShoppingBag,
  "/admin/customers": Users,
  "/admin/credit": BookUser,
  "/admin/till": ReceiptText,
  "/admin/till/shifts": Clock,
  "/admin/till/review": ClipboardCheck,
  "/admin/products": Package,
  "/admin/categories": LayoutGrid,
  "/admin/inventory": Boxes,
  "/admin/reviews": Star,
  "/admin/coupons": TicketPercent,
  "/admin/banners": ImageIcon,
  "/admin/delivery": Truck,
  "/admin/settings": Settings,
  "/admin/staff": UserCog,
  "/admin/notifications": Bell,
  "/admin/audit": ScrollText,
};

/** The item for this page: the one whose address it is, or the longest one it is under. */
function activeHref(items: readonly AdminNavItem[], pathname: string): string | undefined {
  return items
    .filter((item) => (item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .toSorted((a, b) => b.href.length - a.href.length)[0]?.href;
}

function NavList({ items, onNavigate }: { items: AdminNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(items, pathname);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Admin" className="space-y-6">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-300/80">{group}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const active = item.href === current;
                const Icon = ICONS[item.href] ?? LayoutDashboard;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors",
                        active ? "bg-white/[0.12] text-white" : "text-brand-100/85 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gold-400" /> : null}
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-gold-300" : "text-brand-300")} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebarNav({ items }: { items: AdminNavItem[] }) {
  return <NavList items={items} />;
}

/** "Sales › Orders" in the top bar, so every page says where it is. */
export function AdminWhere({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const item = items.find((candidate) => candidate.href === activeHref(items, pathname));
  if (!item) return null;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
      <span className="hidden sm:inline">{item.group}</span>
      <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-subtle sm:block" aria-hidden="true" />
      <span className="truncate font-extrabold text-ink">{item.label}</span>
    </p>
  );
}

export function AdminMobileNav({ items }: { items: AdminNavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-soft lg:hidden" aria-label="Open admin menu">
          <Menu className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <SheetContent title="Admin menu" className="bg-brand-900 text-white [&_h2]:text-white">
        <div className="p-3">
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Dialog>
  );
}

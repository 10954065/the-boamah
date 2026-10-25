"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
  group: string;
}

function NavList({ items, onNavigate }: { items: AdminNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Admin" className="space-y-5">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{group}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-brand-700 text-white" : "text-brand-100 hover:bg-brand-800 hover:text-white",
                      )}
                    >
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

export function AdminMobileNav({ items }: { items: AdminNavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-soft lg:hidden" aria-label="Open admin menu">
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

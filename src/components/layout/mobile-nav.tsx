"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
}

interface MobileNavProps {
  links: NavLink[];
  categories: NavLink[];
  accountLinks: NavLink[];
}

export function MobileNav({ links, categories, accountLinks }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const item = (link: NavLink) => (
    <li key={link.href}>
      <Link
        href={link.href}
        onClick={() => setOpen(false)}
        aria-current={pathname === link.href ? "page" : undefined}
        className={cn(
          "block rounded-md px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-soft",
          pathname === link.href && "bg-brand-50 text-brand-800",
        )}
      >
        {link.label}
      </Link>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-soft lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <SheetContent title="Menu" side="left">
        <nav aria-label="Mobile" className="space-y-6 p-3">
          <ul className="space-y-0.5">{links.map(item)}</ul>
          {categories.length > 0 ? (
            <div>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Categories</p>
              <ul className="space-y-0.5">{categories.map(item)}</ul>
            </div>
          ) : null}
          <div>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Account</p>
            <ul className="space-y-0.5">{accountLinks.map(item)}</ul>
          </div>
        </nav>
      </SheetContent>
    </Dialog>
  );
}

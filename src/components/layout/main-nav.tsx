"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
}

/** Links with a query (e.g. New Arrivals) are shortcuts into a page, so they are never marked current. */
function isCurrent(href: string, pathname: string): boolean {
  if (href.includes("?")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop menu links with a sliding underline on hover and under the current page. */
export function MainNavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return links.map((link) => {
    const current = isCurrent(link.href, pathname);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "relative py-1 font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:rounded-full after:bg-brand-600 after:transition-transform after:duration-300 after:ease-out hover:text-brand-700 hover:after:scale-x-100 motion-reduce:after:transition-none",
          current ? "text-brand-700 after:scale-x-100" : "text-ink-muted after:scale-x-0",
        )}
      >
        {link.label}
      </Link>
    );
  });
}

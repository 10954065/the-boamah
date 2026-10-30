"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, PackageSearch, Search, ShoppingBasket, type LucideIcon } from "lucide-react";
import { useCartDrawer } from "@/components/store/cart-drawer";
import { cn } from "@/lib/utils";

/** The search box listens for this to take focus (see search-box.tsx). */
export const FOCUS_SEARCH_EVENT = "store:focus-search";

interface BottomNavProps {
  cartCount: number;
}

function Item({ icon: Icon, label, active, badge }: { icon: LucideIcon; label: string; active: boolean; badge?: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-5 top-0 h-0.5 origin-center rounded-full bg-brand-700 transition-transform duration-300",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
      <span className="relative">
        <Icon className={cn("h-5 w-5 transition-transform duration-200", active && "scale-110")} aria-hidden="true" />
        {badge ? (
          <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-brand-900">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
    </>
  );
}

const itemClass = (active: boolean) =>
  cn(
    "relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
    active ? "text-brand-700" : "text-ink-muted hover:text-ink",
  );

/** App-style menu pinned to the bottom of phone screens. */
export function BottomNav({ cartCount }: BottomNavProps) {
  const pathname = usePathname();
  const { openCart } = useCartDrawer();
  const isActive = (prefix: string) => (prefix === "/" ? pathname === "/" : pathname.startsWith(prefix));

  return (
    <nav
      aria-label="Shortcuts"
      data-bottom-nav=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-6px_20px_-12px_rgba(15,48,34,0.3)] backdrop-blur lg:hidden"
    >
      <ul className="flex h-[3.75rem]">
        <li className="flex flex-1">
          <Link href="/" className={itemClass(isActive("/"))} aria-current={isActive("/") ? "page" : undefined}>
            <Item icon={House} label="Home" active={isActive("/")} />
          </Link>
        </li>
        <li className="flex flex-1">
          <Link href="/categories" className={itemClass(isActive("/categories"))} aria-current={isActive("/categories") ? "page" : undefined}>
            <Item icon={LayoutGrid} label="Categories" active={isActive("/categories")} />
          </Link>
        </li>
        <li className="flex flex-1">
          <button type="button" className={itemClass(false)} onClick={() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))}>
            <Item icon={Search} label="Search" active={false} />
          </button>
        </li>
        <li className="flex flex-1">
          <Link
            href="/cart"
            className={itemClass(isActive("/cart"))}
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              openCart();
            }}
          >
            <Item icon={ShoppingBasket} label="Cart" active={isActive("/cart")} badge={cartCount} />
          </Link>
        </li>
        <li className="flex flex-1">
          <Link href="/track-order" className={itemClass(isActive("/track-order"))} aria-current={isActive("/track-order") ? "page" : undefined}>
            <Item icon={PackageSearch} label="Track" active={isActive("/track-order")} />
          </Link>
        </li>
      </ul>
    </nav>
  );
}

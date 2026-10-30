import Link from "next/link";
import { ChevronRight, PackageSearch, ShoppingBasket } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CartLink } from "@/components/store/cart-drawer";
import { getCartCount } from "@/server/cart";
import { getActiveCategories } from "@/server/catalog";
import { getStoreSettings } from "@/server/settings";
import { BottomNav } from "./bottom-nav";
import { MainNavLinks } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { SearchBox } from "./search-box";

export const PRIMARY_LINKS = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/categories", label: "Categories" },
  { href: "/offers", label: "Special Offers" },
  { href: "/shop?sort=newest", label: "New Arrivals" },
  { href: "/contact", label: "Contact Us" },
];

const ORDER_LINKS = [{ href: "/track-order", label: "Track an order" }];

async function AnnouncementBar() {
  const settings = await getStoreSettings();
  if (!settings.announcementEnabled || !settings.announcementText) return null;
  const content = (
    <span className="inline-flex items-center gap-1">
      {settings.announcementText}
      {settings.announcementLink ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
    </span>
  );
  return (
    <div className="bg-brand-800 text-brand-50">
      <div className="container-page flex min-h-9 items-center justify-center py-1.5 text-center text-[13px] font-medium">
        {settings.announcementLink ? (
          <Link href={settings.announcementLink} className="hover:underline">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

export async function SiteHeader() {
  const [cartCount, categories] = await Promise.all([getCartCount(), getActiveCategories()]);

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
        <div className="container-page flex h-[68px] items-center gap-3 lg:gap-8">
          <MobileNav
            links={PRIMARY_LINKS}
            categories={categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))}
            orderLinks={ORDER_LINKS}
          />
          <Logo compact />
          <SearchBox className="hidden min-w-0 flex-1 lg:block lg:max-w-2xl" />
          <nav aria-label="Orders and cart" className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/track-order"
              className="flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-ink hover:bg-soft sm:px-3"
              aria-label="Track an order"
            >
              <PackageSearch className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Track order</span>
            </Link>
            <CartLink
              count={cartCount}
              className="relative flex h-10 items-center gap-2 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-brand-900">
                {cartCount}
              </span>
            </CartLink>
          </nav>
        </div>
        <div className="container-page pb-3 lg:hidden">
          <SearchBox />
        </div>
        <nav aria-label="Main" className="hidden border-t border-line lg:block">
          <div className="container-page flex h-11 items-center gap-7 text-sm">
            <MainNavLinks links={PRIMARY_LINKS} />
            <span className="ml-auto flex items-center gap-5 overflow-hidden">
              {categories.slice(0, 4).map((c) => (
                <Link key={c.id} href={`/categories/${c.slug}`} className="whitespace-nowrap text-[13px] text-ink-subtle hover:text-brand-700">
                  {c.name}
                </Link>
              ))}
            </span>
          </div>
        </nav>
      </header>
      <BottomNav cartCount={cartCount} />
    </>
  );
}

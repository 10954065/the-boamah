import Link from "next/link";
import { ChevronRight, Heart, LayoutDashboard, ShoppingBasket, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { getCartCount } from "@/server/cart";
import { getActiveCategories } from "@/server/catalog";
import { getCurrentUser } from "@/server/session";
import { getStoreSettings } from "@/server/settings";
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
  const [user, cartCount, categories] = await Promise.all([getCurrentUser(), getCartCount(), getActiveCategories()]);

  const accountLinks = user
    ? [
        { href: "/account", label: "My account" },
        { href: "/account/orders", label: "My orders" },
        { href: "/account/wishlist", label: "Wishlist" },
        ...(user.isStaff ? [{ href: "/admin", label: "Admin dashboard" }] : []),
      ]
    : [
        { href: "/login", label: "Sign in" },
        { href: "/register", label: "Create account" },
        { href: "/track-order", label: "Track an order" },
      ];

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
        <div className="container-page flex h-[68px] items-center gap-3 lg:gap-8">
          <MobileNav
            links={PRIMARY_LINKS}
            categories={categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))}
            accountLinks={accountLinks}
          />
          <Logo compact />
          <SearchBox className="hidden min-w-0 flex-1 lg:block lg:max-w-2xl" />
          <nav aria-label="Account" className="ml-auto flex items-center gap-1 sm:gap-2">
            {user?.isStaff ? (
              <Link
                href="/admin"
                className="hidden h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-soft hover:text-ink xl:flex"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Admin
              </Link>
            ) : null}
            <Link
              href={user ? "/account" : "/login"}
              className="flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-ink hover:bg-soft sm:px-3"
              aria-label={user ? "My account" : "Sign in"}
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">{user ? `Hi, ${user.name.split(" ")[0]}` : "Sign in"}</span>
            </Link>
            <Link
              href="/account/wishlist"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-soft sm:flex"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="/cart"
              className="relative flex h-10 items-center gap-2 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            >
              <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-brand-900">
                {cartCount}
              </span>
            </Link>
          </nav>
        </div>
        <div className="container-page pb-3 lg:hidden">
          <SearchBox />
        </div>
        <nav aria-label="Main" className="hidden border-t border-line lg:block">
          <div className="container-page flex h-11 items-center gap-7 text-sm">
            {PRIMARY_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="font-medium text-ink-muted transition-colors hover:text-brand-700">
                {link.label}
              </Link>
            ))}
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
    </>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Phone, ReceiptText, Smartphone, Store, Truck, type LucideIcon } from "lucide-react";
import type { PromoBanner } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import type { HeroProduct } from "@/lib/catalog-types";
import { HERO_TILE_COUNT } from "@/lib/hero-rotation";
import { cn } from "@/lib/utils";
import type { CategoryView } from "@/server/catalog";
import { HeroProductGrid } from "./hero-product-grid";

export function SectionHeading({
  id,
  title,
  subtitle,
  href,
  linkLabel = "View all",
}: {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-extrabold sm:text-2xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

interface HeroContent {
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
}

interface HeroProps {
  banner: PromoBanner | null;
  /** Live catalogue for the rotating grid; the banner photo is used when there are too few. */
  products?: HeroProduct[];
}

export function Hero({ banner, products = [] }: HeroProps) {
  const liveGrid = products.length >= HERO_TILE_COUNT;
  const content: HeroContent = banner
    ? {
        eyebrow: banner.eyebrow,
        title: banner.title,
        subtitle: banner.subtitle,
        imageUrl: banner.imageUrl,
        ctaLabel: banner.ctaLabel ?? "Shop groceries",
        ctaHref: banner.ctaHref ?? "/shop",
      }
    : {
        eyebrow: "Everyday essentials, online",
        title: "Groceries delivered to your door",
        subtitle: "Rice, cooking oil, breakfast, juices, snacks and household basics, ordered online.",
        imageUrl: "/images/banners/hero-products.webp",
        ctaLabel: "Shop groceries",
        ctaHref: "/shop",
      };

  return (
    <section aria-labelledby="hero-title" className="container-page pt-4 sm:pt-6">
      <div className="relative isolate grid overflow-hidden rounded-2xl bg-brand-900 lg:grid-cols-[1.05fr_1fr]">
        {/* Photo: full-bleed behind the text on small screens, its own column from lg up. */}
        <div className="absolute inset-0 -z-10 lg:relative lg:inset-auto lg:z-0 lg:order-2 lg:min-h-[460px]">
          <Image src={content.imageUrl} alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          {liveGrid ? (
            // Covers the banner photo from lg up; the photo stays behind the text on phones.
            <HeroProductGrid products={products} className="absolute inset-0 hidden lg:block" />
          ) : null}
          <div className="absolute inset-0 bg-brand-900/80 lg:hidden" aria-hidden="true" />
        </div>
        <div className="relative flex flex-col justify-end px-6 pb-8 pt-28 sm:px-10 sm:pt-40 lg:justify-center lg:py-16 lg:pl-14">
          {content.eyebrow ? <p className="mb-3 text-[13px] font-bold text-gold-300">{content.eyebrow}</p> : null}
          <h1 id="hero-title" className="max-w-xl text-[32px] font-extrabold leading-[1.08] tracking-tight text-white sm:text-[44px] lg:text-[52px]">
            {content.title}
          </h1>
          {content.subtitle ? <p className="mt-4 max-w-md text-[15px] leading-7 text-brand-100 sm:text-base">{content.subtitle}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={content.ctaHref} className={cn(buttonVariants({ size: "lg", variant: "gold" }), "flex-1 sm:flex-none")}>
              {content.ctaLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              href="/offers"
              className={cn(buttonVariants({ size: "lg" }), "flex-1 bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20 sm:flex-none")}
            >
              View offers
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CategoryTiles({ categories }: { categories: CategoryView[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-title" className="container-page mt-12">
      <SectionHeading id="categories-title" title="Shop by category" href="/categories" linkLabel="All categories" />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id} className="w-[108px] shrink-0 snap-start sm:w-auto">
            <Link
              href={`/categories/${category.slug}`}
              className="group flex h-full flex-col items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-center transition-colors hover:border-brand-300 sm:flex-row sm:gap-3 sm:text-left"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-soft sm:h-14 sm:w-14">
                {category.imageUrl ? <Image src={category.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink group-hover:text-brand-700">{category.name}</span>
                <span className="mt-0.5 block text-xs text-ink-subtle">
                  {category.productCount} {category.productCount === 1 ? "item" : "items"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONES: Record<string, string> = {
  leaf: "bg-leaf-50",
  gold: "bg-gold-50",
  cream: "bg-soft",
  brand: "bg-brand-50",
};

export function PromoBanners({ banners }: { banners: PromoBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <section aria-label="Promotions" className="container-page mt-12">
      <ul className={cn("grid gap-4", banners.length > 1 && "md:grid-cols-2", banners.length > 2 && "lg:grid-cols-3")}>
        {banners.map((banner) => (
          <li key={banner.id}>
            <div
              className={cn(
                "group relative flex h-full min-h-[176px] overflow-hidden rounded-2xl border border-line transition-colors hover:border-brand-300",
                TONES[banner.tone] ?? TONES.cream,
              )}
            >
              <div className="relative z-10 flex w-[58%] flex-col justify-center p-5 sm:p-6">
                {banner.eyebrow ? <p className="text-xs font-bold text-leaf-600">{banner.eyebrow}</p> : null}
                <h3 className="mt-1.5 text-lg font-extrabold leading-snug text-brand-900">{banner.title}</h3>
                {banner.subtitle ? <p className="mt-1 text-[13px] leading-5 text-ink-muted">{banner.subtitle}</p> : null}
                {banner.ctaHref ? (
                  <Link
                    href={banner.ctaHref}
                    className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-700 after:absolute after:inset-0 hover:underline"
                  >
                    {banner.ctaLabel ?? "Shop now"}{" "}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <div className="absolute inset-y-0 right-0 w-[42%]">
                <Image src={banner.imageUrl} alt="" fill sizes="(min-width: 1024px) 200px, 45vw" className="object-cover" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ShopFactsProps {
  onlinePayment: boolean;
  cashOnDelivery: boolean;
  pickup: boolean;
  phone: string | null;
}

interface Fact {
  Icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
}

/** Plain facts about ordering, built from the store settings so each line is true for this shop. */
export function ShopFacts({ onlinePayment, cashOnDelivery, pickup, phone }: ShopFactsProps) {
  const payment: Fact | null = onlinePayment
    ? { Icon: Smartphone, title: "Mobile Money or card", body: "MTN MoMo, Telecel Cash, AirtelTigo Money, Visa and Mastercard." }
    : cashOnDelivery
      ? { Icon: Banknote, title: "Cash on delivery", body: "Pay when your order arrives." }
      : null;
  const help: Fact | null = pickup
    ? { Icon: Store, title: "Pick up from the shop", body: "Choose pickup at checkout and collect your order." }
    : phone
      ? { Icon: Phone, title: "Questions about an order?", body: `Call us on ${phone}.` }
      : null;
  const facts = [
    { Icon: Truck, title: "Delivery to your area", body: "See the areas we cover and what each costs.", href: "/policies/delivery" },
    { Icon: ReceiptText, title: "Fees shown before you pay", body: "Checkout shows the delivery fee and any discount first." },
    payment,
    help,
  ].filter((fact): fact is Fact => fact !== null);

  return (
    <section aria-labelledby="facts-title" className="container-page mt-16">
      <h2 id="facts-title" className="sr-only">
        Ordering from The Boamah&rsquo;s
      </h2>
      <ul
        className={cn(
          "grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2",
          facts.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {facts.map(({ Icon, title, body, href }) => (
          <li key={title} className="flex gap-3 bg-surface p-5">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
            <div>
              <h3 className="text-[15px] font-bold text-ink">
                {href ? (
                  <Link href={href} className="hover:text-brand-700 hover:underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </h3>
              <p className="mt-1 text-sm leading-6 text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

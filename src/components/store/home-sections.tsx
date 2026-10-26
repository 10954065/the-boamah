import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, Headset, ReceiptText, ShoppingBasket, ShoppingCart, Truck } from "lucide-react";
import type { PromoBanner } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CategoryView } from "@/server/catalog";

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
    <div className="reveal mb-5 flex items-end justify-between gap-4">
      <div>
        <span className="mb-2.5 block h-1 w-10 rounded-full bg-gradient-to-r from-gold-400 to-leaf-500" aria-hidden="true" />
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

const line = (i: number) => ({ "--i": i }) as CSSProperties;

export function Hero({ banner, stats }: { banner: PromoBanner | null; stats?: { products: number; categories: number } }) {
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
        title: "Fresh Groceries, Delivered to Your Door.",
        subtitle:
          "Rice, cooking oil, breakfast, juices, snacks and household favourites from The Boamah's Online Grocery Shop.",
        imageUrl: "/images/banners/hero-products.webp",
        ctaLabel: "Shop Groceries",
        ctaHref: "/shop",
      };

  return (
    <section aria-labelledby="hero-title" className="container-page pt-4 sm:pt-6">
      <div className="relative isolate grid overflow-hidden rounded-2xl bg-brand-900 shadow-[var(--shadow-overlay)] lg:grid-cols-[1.05fr_1fr]">
        {/* Photo: full-bleed behind the text on small screens, its own column from lg up. */}
        <div className="absolute inset-0 -z-10 lg:relative lg:inset-auto lg:z-0 lg:order-2 lg:min-h-[480px]">
          <Image
            src={content.imageUrl}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="ken-burns object-cover lg:[clip-path:ellipse(94%_100%_at_100%_50%)]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/85 to-brand-900/40 lg:hidden"
            aria-hidden="true"
          />
          {stats && stats.products > 0 ? (
            <div
              className="rise absolute bottom-8 right-8 hidden items-center gap-3 rounded-2xl bg-brand-900/65 py-3 pl-3 pr-5 text-white shadow-[var(--shadow-overlay)] ring-1 ring-white/20 backdrop-blur-md lg:flex"
              style={line(5)}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-500 text-brand-900">
                <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <strong className="block font-display text-lg">{stats.products} products</strong>
                <span className="text-xs text-brand-100">across {stats.categories} categories</span>
              </span>
            </div>
          ) : null}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_right,black,transparent_55%)]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-leaf-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-gold-400/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col justify-end px-6 pb-8 pt-28 sm:px-10 sm:pt-40 lg:justify-center lg:py-16 lg:pl-14">
          {content.eyebrow ? (
            <p
              className="rise mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold-300 ring-1 ring-gold-400/30"
              style={line(0)}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden="true" />
              {content.eyebrow}
            </p>
          ) : null}
          <h1
            id="hero-title"
            className="rise max-w-xl text-[32px] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[44px] lg:text-[54px]"
            style={line(1)}
          >
            {content.title}
          </h1>
          {content.subtitle ? (
            <p className="rise mt-4 max-w-md text-[15px] leading-7 text-brand-100 sm:text-base" style={line(2)}>
              {content.subtitle}
            </p>
          ) : null}
          <div className="rise mt-7 flex flex-wrap gap-3" style={line(3)}>
            <Link href={content.ctaHref} className={cn(buttonVariants({ size: "lg", variant: "gold" }), "flex-1 sm:flex-none")}>
              {content.ctaLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              href="/offers"
              className={cn(
                buttonVariants({ size: "lg" }),
                "flex-1 bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20 sm:flex-none",
              )}
            >
              View offers
            </Link>
          </div>
          <ul className="rise mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-brand-100" style={line(4)}>
            <li className="flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-leaf-400" aria-hidden="true" /> Secure checkout
            </li>
            <li className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-leaf-400" aria-hidden="true" /> Delivery &amp; pickup options
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function CategoryTiles({ categories }: { categories: CategoryView[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-title" className="container-page mt-12">
      <SectionHeading id="categories-title" title="Shop by category" subtitle="Everything for your kitchen and home." href="/categories" linkLabel="All categories" />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id} className="w-[108px] shrink-0 snap-start sm:w-auto">
            <Link
              href={`/categories/${category.slug}`}
              className="group flex h-full flex-col items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-center transition-[border-color,box-shadow,transform] duration-200 hover:border-brand-200 hover:shadow-[var(--shadow-raised)] motion-safe:hover:-translate-y-0.5 sm:flex-row sm:gap-3 sm:text-left"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-soft sm:h-14 sm:w-14">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink group-hover:text-brand-700">
                  {category.name}
                </span>
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
        {banners.map((banner, index) => (
          <li key={banner.id} className="reveal" style={line(index)}>
            <div
              className={cn(
                "group relative flex h-full min-h-[176px] overflow-hidden rounded-2xl border border-line transition-[box-shadow,transform] duration-300 hover:shadow-[var(--shadow-overlay)] motion-safe:hover:-translate-y-1",
                TONES[banner.tone] ?? TONES.cream,
              )}
            >
              <div className="relative z-10 flex w-[58%] flex-col justify-center p-5 sm:p-6">
                {banner.eyebrow ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-leaf-600">{banner.eyebrow}</p>
                ) : null}
                <h3 className="mt-1.5 text-lg font-extrabold leading-snug text-brand-900">{banner.title}</h3>
                {banner.subtitle ? <p className="mt-1 text-[13px] leading-5 text-ink-muted">{banner.subtitle}</p> : null}
                {banner.ctaHref ? (
                  <Link
                    href={banner.ctaHref}
                    className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-700 after:absolute after:inset-0 hover:underline"
                  >
                    {banner.ctaLabel ?? "Shop now"}{" "}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <div className="absolute inset-y-0 right-0 w-[46%]">
                <Image
                  src={banner.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 200px, 45vw"
                  className="object-cover transition-transform duration-700 [clip-path:circle(78%_at_100%_50%)] group-hover:scale-110"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrustSection({ hasSupportContact }: { hasSupportContact: boolean }) {
  const items = [
    { Icon: ShoppingCart, title: "Convenient ordering", body: "Order from your phone or computer whenever it suits you." },
    { Icon: CreditCard, title: "Secure checkout", body: "Online payments are processed by a licensed payment provider." },
    { Icon: ReceiptText, title: "Clear pricing", body: "Prices, delivery fees and discounts are shown before you pay." },
    { Icon: Truck, title: "Delivery options", body: "Choose delivery to your area, or pickup where available." },
    ...(hasSupportContact
      ? [{ Icon: Headset, title: "Customer support", body: "Questions about an order? Our team is here to help." }]
      : []),
  ];
  return (
    <section aria-labelledby="why-title" className="container-page mt-16">
      <div className="relative isolate overflow-hidden rounded-2xl bg-brand-900 px-6 py-12 text-brand-50 shadow-[var(--shadow-overlay)] sm:px-10 lg:py-14">
        <div
          className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          aria-hidden="true"
        />
        <div className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-leaf-500/25 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-36 left-1/4 -z-10 h-80 w-80 rounded-full bg-gold-400/15 blur-3xl" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-300">The Boamah&rsquo;s promise</p>
        <h2 id="why-title" className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
          Why shop with The Boamah&rsquo;s?
        </h2>
        <ul className={cn("mt-8 grid gap-4 sm:grid-cols-2", items.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {items.map(({ Icon, title, body }, index) => (
            <li
              key={title}
              className="reveal group rounded-xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur-sm transition-[background-color,box-shadow,transform] duration-300 hover:bg-white/10 hover:ring-gold-400/40 motion-safe:hover:-translate-y-1"
              style={line(index)}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-500 text-brand-900 shadow-lg shadow-gold-500/20 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-brand-200">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, Headset, ReceiptText, ShoppingCart, Truck } from "lucide-react";
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

export function Hero({ banner }: { banner: PromoBanner | null }) {
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
          "Shop your everyday essentials, fresh produce, and family favourites from The Boamah's Online Grocery Shop.",
        imageUrl: "/images/banners/hero.webp",
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
            className="object-cover lg:[clip-path:ellipse(94%_100%_at_100%_50%)]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/85 to-brand-900/40 lg:hidden"
            aria-hidden="true"
          />
        </div>
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-leaf-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col justify-end px-6 pb-8 pt-28 sm:px-10 sm:pt-40 lg:justify-center lg:py-16 lg:pl-14">
          {content.eyebrow ? (
            <p className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold-300 ring-1 ring-gold-400/30">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden="true" />
              {content.eyebrow}
            </p>
          ) : null}
          <h1
            id="hero-title"
            className="max-w-xl text-[32px] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[44px] lg:text-[54px]"
          >
            {content.title}
          </h1>
          {content.subtitle ? (
            <p className="mt-4 max-w-md text-[15px] leading-7 text-brand-100 sm:text-base">{content.subtitle}</p>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
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
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-brand-100">
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
        {banners.map((banner) => (
          <li key={banner.id}>
            <div className={cn("relative flex h-full min-h-[176px] overflow-hidden rounded-lg border border-line", TONES[banner.tone] ?? TONES.cream)}>
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
                    {banner.ctaLabel ?? "Shop now"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <div className="absolute inset-y-0 right-0 w-[46%]">
                <Image
                  src={banner.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 200px, 45vw"
                  className="object-cover [clip-path:circle(78%_at_100%_50%)]"
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
      <div className="rounded-lg bg-brand-800 px-6 py-10 text-brand-50 sm:px-10">
        <h2 id="why-title" className="text-xl font-extrabold text-white sm:text-2xl">
          Why shop with The Boamah&rsquo;s?
        </h2>
        <ul className={cn("mt-7 grid gap-6 sm:grid-cols-2", items.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {items.map(({ Icon, title, body }) => (
            <li key={title}>
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-700 text-leaf-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-[15px] font-bold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-brand-200">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
